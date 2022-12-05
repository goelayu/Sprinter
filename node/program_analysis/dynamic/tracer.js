/**
 * Tracer code that is executed at runtime.
 */

// do not create any global property,
// unless explicitly specified using the window object
(function () {
  window.__tracedata__ = {};
  window.__stackHead__ = null;

  class logger {
    constructor(rootObj, rootName) {
      this.log = {};
      this.heap = new HeapMap(rootObj, rootName);
      var scope = rootName.indexOf("window") == 0 ? 'global': 'closure';
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
          var [type, id, key, method] = res[file][i];
          res[file][i] = [type, this.heap.idToStr[id], key, method];
        }
      }
      this.finalTraceData = res;
      return res;
    }
  }

  class __Tracer__ {
    constructor() {
      this.loggers = [];
    }

    removeProxy(obj) {
      if (obj && obj.__isProxy__) {
        return obj.__target__;
      }
      return obj;
    }

    createLogger(obj, objName) {
      var l = new logger(obj, objName);
      this.loggers.push(l);
      return l.proxy;
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
              var cn = n.children[k];
              if (!this.idToStr[cn.id]) this.idToStr[cn.id] = `${p}[${k}]`;
            }
          }
        }
      }
    }
  }

  class HeapNode {
    constructor(id, obj) {
      this.id = id;
      this.obj = obj;
      this.children = {};
    }

    addEdge(node, key) {
      this.children[key] = node;
    }
  }

  var proxyWrapper = function (heap, logStore, scope) {

    var logger = function (target, key, method, type) {
      if (typeof method == "function" || typeof method == "object") {
        method != null && heap.addEdge(target, key, method);
      } else {
        var n = heap.addNode(target);
        if (!window.__stackHead__) throw new Error("Stack head is null");
        if (!logStore[window.__stackHead__])
          logStore[window.__stackHead__] = [];
        logStore[window.__stackHead__].push([type, n.id, key, method]);
      }
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
        if (scope == 'closure')
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
