// Tracer code that is executed at runtime.

// do not create any global property,
// unless explicitly specified using the window object
(function () {
  window.__stackHead__ = null;
  var tracking = true;

  window.__customLog__ = console.log; // save the original console.log, since some weired pages would silence it :|

  class logger {
    constructor(rootObj, rootName, heap) {
      this.log = {};
      this.rootName = rootName;
      this.heap = heap ? heap : new HeapMap(rootObj, rootName);
      var scope = rootName.indexOf("window") == 0 ? "global" : "closure";
      this.handler = proxyWrapper(this.heap, this.log, scope);
      this.proxy = new Proxy(rootObj, this.handler);
    }

    resolveLogData() {
      this.heap.resolveIds();
      var t = this.log;
      var res = {};
      for (var file in t) {
        res[file] = t[file];
        for (var i = 0; i < res[file].length; i++) {
          var [type, id, key, method, rootName] = res[file][i];
          res[file][i] = [type, this.heap.idToStr[id], key, method, rootName];
        }
      }
      this.finalTraceData = res;
      return res;
    }
  }

  class __Tracer__ {
    constructor() {
      this.loggers = [];
      this.objToHeaps = new Map();
      this.fileClosures = {};
      this.provenanceData = {};
      this.provSinks = {};
      this.taintReads = {};
      this.cacheStats = {
        hits: 0,
        misses: 0,
        errors: 0,
        firsts: 0,
      };
    }

    getCacheStats() {
      return this.cacheStats;
    }

    updateCacheStats(prop) {
      this.cacheStats[prop] += 1;
    }

    removeProxy(obj) {
      try {
        if (obj && obj.__isProxy__) {
          return obj.__target__;
        }
        return obj;
      } catch (e) {
        return obj;
      }
    }

    createLogger(obj, objName) {
      // var heap = this.objToHeaps.get(objName)
      //   ? this.objToHeaps.get(objName)
      //   : null;
      var l = new logger(obj, objName, null);
      this.objToHeaps.set(objName, l.heap);
      this.loggers.push(l);
      return l.proxy;
    }

    setFileClosure(file, closure) {
      this.fileClosures[file] = closure;
    }

    taintTrack(file) {
      var pd = this.provenanceData[file];
      var sinks = this.provSinks[file];
      if (!pd || !sinks) return new Set();
      var res = (this.taintReads[file] = new Set());
      try {
        var reads = [],
          seen = new Set();
        for (var s of sinks) {
          reads.push(s);
        }
        while (reads.length > 0) {
          var r = reads.pop();
          if (seen.has(r)) continue;
          res.add(r);
          seen.add(r);
          var provReads;
          if (typeof r == "string") {
            provReads = pd.s[r];
          } else {
            provReads = pd.o.get(r);
          }
          if (provReads) {
            for (var pr of provReads) {
              if (seen.has(pr)) continue;
              reads.push(pr);
            }
          }
        }
      } catch (e) {
        return new Set();
      }
      return res;
    }

    resolveLogData() {
      var res = {};
      for (var i = 0; i < this.loggers.length; i++) {
        var l = this.loggers[i];
        var t = l.resolveLogData();
        for (var file in t) {
          if (!res[file]) res[file] = [];
          // for (var e of t[file]) {
          //   res[file].push(e);
          //   // var obj = e[3];
          //   // var dp = this.taintTrack(file);
          //   // if (dp && dp.has(obj)) {
          //   //   res[file].push(e);
          //   // } else {
          //   //   // console.log(`trimming read state: ${e}`);
          //   // }
          // }
          res[file] = res[file].concat(t[file]);
        }
      }
      this.finalTraceData = res;
      tracking = false;
      return res;
    }

    serializeLogData() {
      var orig = this.finalTraceData;
      if (!orig) {
        console.log("Please call resolveLogData() before serializing");
        return;
      }
      var res = {};
      for (var file in orig) {
        var myClosures = {};
        this.fileClosures[file].forEach((x) => (myClosures[x] = true));
        var f = orig[file].filter((x) => x[1] && !myClosures[x[4]]);
        res[file] = [];
        for (var i = 0; i < f.length; i++) {
          try {
            var str = JSON.stringify(f[i].slice(0, 4));
            res[file].push(str);
          } catch (e) {
            // no-op
          }
        }
      }
      this.serialLog = res;
      return res;
    }

    dataProv(ret, ids) {
      if (ret == undefined) return ret;
      if (ids && ids.length == 0) return ret;
      var stackhead = window.__stackHead__;
      if (!stackhead) return ret;
      if (!this.provenanceData[stackhead])
        this.provenanceData[stackhead] = {
          s: {},
          o: new Map(),
          reads: new Set(),
        };
      if (typeof ret === "string") this.provenanceData[stackhead].s[ret] = ids;
      else if (typeof ret == "object" || typeof ret == "function")
        this.provenanceData[stackhead].o.set(ret, ids);
      ids.forEach((id) => this.provenanceData[stackhead].reads.add(id));
      return ret;
    }

    dataProvSinks(ret, ids) {
      if (ret == undefined) return ret;
      if (ids && ids.length == 0) return ret;
      var stackhead = window.__stackHead__;
      if (!stackhead) return ret;
      if (!this.provSinks[stackhead]) this.provSinks[stackhead] = new Set();
      ids.forEach((id) => this.provSinks[stackhead].add(id));
      return ret;
    }
  }

  class HeapMap {
    constructor(rootObj, rootName) {
      this.id = -1;
      this.objectToNode = new Map();
      this.idToNode = new Map();
      this.nodes = [];
      this.root = this.addNode(rootObj);
      this.rootName = rootName;
    }

    addNode(obj) {
      if (!this.objectToNode.has(obj)) {
        this.id += 1;
        var n = new HeapNode(this.id, obj);
        this.idToNode.set(n.id, n);
        this.objectToNode.set(obj, n);
        this.nodes.push(n);
      }
      return this.objectToNode.get(obj);
    }

    addEdge(obj1, key, obj2) {
      var n1 = this.addNode(obj1);
      var n2 = this.addNode(obj2);
      n1.addEdge(n2, key);
      return n1;
    }

    resolveIds() {
      if (this.idsResolved) return;
      this.idToStr = { 0: this.rootName };
      var allIds = new Set();
      this.nodes.forEach((n) => {
        allIds.add(n.id);
      });
      allIds = Array.from(allIds);
      for (var iter = 0; iter < 2; iter++) {
        for (var i = 0; i < allIds.length; i++) {
          var id = allIds[i];
          if (this.idToStr[id]) {
            var p = this.idToStr[id];
            var n = this.idToNode.get(id);
            for (var k in n.children) {
              if (!Array.isArray(n.children[k])) continue;
              for (var cn of n.children[k]) {
                if (!this.idToStr[cn.id]) this.idToStr[cn.id] = `${p}['${k}']`;
              }
            }
          }
        }
      }
      this.idsResolved = true;
    }
  }

  class HeapNode {
    constructor(id, obj) {
      this.id = id;
      this.obj = obj;
      this.children = {};
    }

    addEdge(node, key) {
      if (!Object.prototype.hasOwnProperty.call(this.children, key))
        this.children[key] = [];
      if (!this.children[key].includes(node)) this.children[key].push(node);
    }
  }

  var proxyWrapper = function (heap, logStore, scope) {
    var skipLogCondtion = function (target, key, method, type) {
      // return (
      //   typeof method == "function" ||
      //   (type == "read" &&
      //     (typeof method == "object" || typeof method == "symbol"))
      // );
      return (
        (type == "write" && typeof method == "function") ||
        typeof method == "object" ||
        (type == "read" && typeof method == "function")
      );
      // return typeof method == "function" || typeof method == "object";
    };

    var logger = function (target, key, method, type) {
      var id = window.__stackHead__;
      if (!id) return;
      if (typeof method == "function" || typeof method == "object") {
        method != null && heap.addEdge(target, key, method);
        // if (type == "read") return;
      }
      var n = heap.addNode(target);
      if (!logStore[id]) logStore[id] = [];
      var prev;
      if (logStore[id].length > 0) {
        prev = logStore[id][logStore[id].length - 1];
        if (type == "read" && prev[0] == "read" && prev[3] === target)
          logStore[id].pop();
      }
      if (skipLogCondtion(target, key, method, type)) return;
      if (method && method.__isProxy__) method = method.__target__;
      logStore[id].push([type, n.id, key, method, heap.rootName]);
    };

    var ignoreKeys = [
      "__proto__",
      "toJSON",
      "apply",
      "call",
      "prototype",
      "location",
      "readyState",
    ];

    var extractObjFromProxy = function (obj) {
      if (obj && obj.__isProxy__) return extractObjFromProxy(obj.__target__);
      return obj;
    };

    var handler = {
      get: function (target, key) {
        if (key == "__isProxy__") return true;
        if (key == "__target__") return target;
        var method = Reflect.get(target, key);

        if (
          target.__proto__ === HTMLIFrameElement.prototype ||
          ignoreKeys.indexOf(key) != -1 ||
          tracking == false
        )
          return method;

        method = extractObjFromProxy(method);

        if (
          scope == "closure" &&
          typeof key == "string" &&
          target[`get_${key}`] &&
          typeof target[`get_${key}`] == "function"
        ) {
          var maybeNewMethod = target[`get_${key}`]();
          if (maybeNewMethod !== method) {
            method = maybeNewMethod;
            target[key] = method;
          }
        }

        logger(target, key, method, "read");

        if (
          (typeof method != "function" && typeof method != "object") ||
          method === null
        )
          return method;

        var desc = Object.getOwnPropertyDescriptor(target, key);
        if (
          (desc && desc.configurable == false && desc.writable == false) ||
          (method && method.__isProxy__)
        ) {
          return method;
        }

        var p = new Proxy(method, handler);
        return p;
      },
      set: function (target, name, value) {
        if (value && value.__isProxy__) value = value.__target__;
        logger(target, name, value, "write");
        target[name] = value;
        if (scope == "closure" && typeof name == "string")
          target[`set_${name}`] && target[`set_${name}`](value);
        return true;
      },

      apply: function (target, thisArg, argumentsList) {
        if (thisArg && thisArg.__isProxy__) thisArg = thisArg.__target__;
        return Reflect.apply(target, thisArg, argumentsList);
      },

      construct: function (target, args, newPrototype) {
        if (newPrototype && newPrototype.__isProxy__)
          newPrototype = newPrototype.__target__;
        return Reflect.construct(target, args, newPrototype);
      },

      setPrototypeOf: function (target, prototype) {
        if (prototype && prototype.__isProxy__)
          prototype = prototype.__target__;
        return Reflect.setPrototypeOf(target, prototype);
      },

      getPrototypeOf: function (target) {
        return Reflect.getPrototypeOf(target);
      },
    };

    return handler;
  };

  if (!window.__tracer__) {
    window.__tracer__ = new __Tracer__();
    window.__proxy__ = window.__tracer__.createLogger(window, "window");
  }

  /*Creates shim for every dom methods
     The purpose of the shim is to check for proxy argument types
  */
  function createShimForDOMMethods(self) {
    var HTMLNames = [
      "HTMLDocument",
      "HTMLLinkElement",
      "HTMLElement",
      "HTMLHtmlElement",
      "HTMLDivElement",
      "HTMLAnchorElement",
      "HTMLSelectElement",
      "HTMLOptionElement",
      "HTMLInputElement",
      "HTMLHeadElement",
      "HTMLSpanElement",
      "XULElement",
      "HTMLBodyElement",
      "HTMLTableElement",
      "HTMLTableCellElement",
      "HTMLTextAreaElement",
      "HTMLScriptElement",
      "HTMLAudioElement",
      "HTMLMediaElement",
      "HTMLParagraphElement",
      "DOMImplementation",
      "HTMLButtonElement",
      "HTMLLIElement",
      "HTMLUListElement",
      "HTMLIFrameElement",
      "HTMLFormElement",
      "HTMLHeadingElement",
      "HTMLImageElement",
      "IntersectionObserver",
      "HTMLStyleElement",
      "HTMLTableRowElement",
      "HTMLTableSectionElement",
      "PerformanceObserver",
      "HTMLBRElement",
      "Node",
      "EventTarget",
      "HTMLCollection",
      "MutationObserver",
      "Document",
      "HTMLCanvasElement",
      "CanvasRenderingContext2D",
      "CanvasGradient",
      "CanvasPattern",
      "ImageBitMap",
      "ImageData",
      "TextMetrics",
      "Path2D",
      "CSSCounterStyleRule",
      "Element",
      "RegExp",
      "Crypto",
      "Object",
      "Map",
      "MediaDevices",
      "StorageManager",
      "CacheStorage",
      "WeakMap",
    ];

    var domClasses = ["Document", "Element", "Node"];

    window.__domaccess__ = {};

    HTMLNames.forEach((_class) => {
      self[_class] &&
        self[_class].prototype &&
        Object.getOwnPropertyNames(self[_class].prototype).forEach(
          (classKey) => {
            try {
              if (typeof self[_class].prototype[classKey] == "function") {
                var origMethod = self[_class].prototype[classKey];
                if (classKey == "constructor") return;
                self[_class].prototype[classKey] = function () {
                  var thisObj = this;
                  for (var i = 0; i < arguments.length; i++) {
                    var arg = arguments[i];
                    if (arg && arg.__isProxy__) arguments[i] = arg.__target__;
                  }
                  if (thisObj && thisObj.__isProxy__)
                    thisObj = thisObj.__target__;
                  /*If regex testing, return the original method*/
                  if (
                    (origMethod.name == "test" || origMethod.name == "exec") &&
                    arguments[0] &&
                    arguments[0].__isShimmed__
                  )
                    arguments[0] = arguments[0].__orig__;
                  // var domkey = `${_class}.${classKey}`;
                  // if (!window.__domaccess__[domkey])
                  //   window.__domaccess__[domkey] = [];
                  // domClasses.some((domClass) => _class == domClass) &&
                  //   typeof arguments[0] == "string" &&
                  //   window.__domaccess__[domkey].push(arguments[0]);

                  return origMethod.apply(thisObj, arguments);
                };
                self[_class].prototype[classKey].__isShimmed__ = true;
                self[_class].prototype[classKey].__orig__ = origMethod;
              }
            } catch (e) {}
          }
        );
    });
  }

  function customShims(self) {
    var _create = Object.create;
    self.Object.create = function () {
      var thisObj = this;
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (arg && arg.__isProxy__) arguments[i] = arg.__target__;
      }
      if (thisObj && thisObj.__isProxy__) thisObj = thisObj.__target__;
      return _create.apply(thisObj, arguments);
    };

    var _encodeURI = window.encodeURI;
    self.window.encodeURI = function (uri) {
      var _t;
      if (uri && (_t = uri.__target__)) uri = _t;
      return _encodeURI.call(this, uri);
    };

    var _encodeURIComponent = window.encodeURIComponent;
    self.window.encodeURIComponent = function (uri) {
      var _t;
      if (uri && (_t = uri.__target__)) uri = _t;
      return _encodeURIComponent.call(this, uri);
    };

    var _getComputedStyle = window.getComputedStyle;
    self.window.getComputedStyle = function () {
      var thisObj = this;
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (arg && arg.__isProxy__) arguments[i] = arg.__target__;
      }
      if (thisObj && thisObj.__isProxy__) thisObj = thisObj.__target__;
      return _getComputedStyle.apply(thisObj, arguments);
    };

    var _getPrototypeOf = Object.getPrototypeOf;
    self.Object.getPrototypeOf = function () {
      var thisObj = this;
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (arg && arg.__isProxy__) arguments[i] = arg.__target__;
      }
      if (thisObj && thisObj.__isProxy__) thisObj = thisObj.__target__;
      return _getPrototypeOf.apply(thisObj, arguments);
    };

    var _setPrototypeOf = Object.setPrototypeOf;
    self.Object.setPrototypeOf = function () {
      var thisObj = this;
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (arg && arg.__isProxy__) arguments[i] = arg.__target__;
      }
      if (thisObj && thisObj.__isProxy__) thisObj = thisObj.__target__;
      return _setPrototypeOf.apply(thisObj, arguments);
    };
  }

  customShims(window);
  createShimForDOMMethods(window);
})();
