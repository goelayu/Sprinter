/**
 * Tracer code that is executed at runtime.
 */

// do not create any global property,
// unless explicitly specified using the window object
(function () {
  window.__tracedata__ = {};
  window.__stackHead__ = null;

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
    }

    removeProxy(obj) {
      if (obj && obj.__isProxy__) {
        return obj.__target__;
      }
      return obj;
    }

    createLogger(obj, objName) {
      var heap = this.objToHeaps.get(objName)
        ? this.objToHeaps.get(objName)
        : null;
      var l = new logger(obj, objName, heap);
      this.objToHeaps.set(objName, l.heap);
      this.loggers.push(l);
      return l.proxy;
    }

    setFileClosure(file, closure) {
      this.fileClosures[file] = closure;
    }

    resolveLogData() {
      var res = {};
      for (var i = 0; i < this.loggers.length; i++) {
        var l = this.loggers[i];
        var t = l.resolveLogData();
        for (var file in t) {
          if (!res[file]) res[file] = [];
          res[file] = res[file].concat(t[file]);
        }
      }
      this.finalTraceData = res;
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
            var str = JSON.stringify(f[i]);
            res[file].push(str);
          } catch (e) {
            // no-op
          }
        }
      }
      this.serialLog = res;
      return res;
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
      for (var k = 0; k < 2; k++) {
        for (var i = 0; i < allIds.length; i++) {
          var id = allIds[i];
          if (this.idToStr[id]) {
            var p = this.idToStr[id];
            var n = this.idToNode.get(id);
            for (var k in n.children) {
              for (var cn of n.children[k]) {
                if (!this.idToStr[cn.id]) this.idToStr[cn.id] = `${p}[${k}]`;
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
      this.children[key].push(node);
    }
  }

  var proxyWrapper = function (heap, logStore, scope) {
    var skipLogCondtion = function (target, key, method, type) {
      return type == "read" && typeof method == "function";
    };

    var logger = function (target, key, method, type) {
      var id = window.__stackHead__;
      if (typeof method == "function" || typeof method == "object") {
        method != null && heap.addEdge(target, key, method);
        // if (type == "read") return;
      }
      var n = heap.addNode(target);
      if (!id) throw new Error("Stack head is null");
      if (!logStore[id]) logStore[id] = [];
      var prev;
      if (logStore[id].length > 0) {
        prev = logStore[id][logStore[id].length - 1];
        if (type == "read" && prev[0] == "read" && prev[3] == target)
          logStore[id].pop();
      }
      if (skipLogCondtion(target, key, method, type)) return;
      logStore[id].push([type, n.id, key, method, heap.rootName]);
    };

    var ignoreKeys = ["__proto__", "toJSON", "apply", "call", "prototype"];

    var handler = {
      get: function (target, key) {
        if (key == "__isProxy__") return true;
        if (key == "__target__") return target;
        var method = Reflect.get(target, key);
        if (
          (typeof method != "function" && typeof method != "object") ||
          method === null ||
          method === undefined
        )
          return method;

        if (method.__isProxy__) method = method.__target__;

        logger(target, key, method, "read");

        var desc = Object.getOwnPropertyDescriptor(target, key);
        if (
          (desc && desc.configurable == false && desc.writable == false) ||
          (method && method.__isProxy__) ||
          ignoreKeys.indexOf(key) != -1
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
        if (scope == "closure")
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

  window.__tracer__ = new __Tracer__();
  window.__proxy__ = window.__tracer__.createLogger(window, "window");
})();
