/**
 * Tracer code that is executed at runtime.
 */

// do not create any global property,
// unless explicitly specified using the window object
(function () {
  window.__tracedata__ = {};
  window.__stackHead__ = null;

  class __Tracer__ {
    constructor(heap) {
      this.__stack__ = [];
      this.__stackHead__ = null;
      this.__tracedata__ = {};
      this.__heap = heap;
    }

    removeProxy(obj) {
      if (obj && obj.__isProxy__) {
        return obj.__target__;
      }
      return obj;
    }

    resolveTraceData() {
      this.__heap.resolveIds();
      var t = window.__tracedata__;
      var res = {};
      for (var file in t) {
        res[file] = t[file];
        for (var i = 0; i < res[file].length; i++) {
          var [type, id, key, method] = res[file][i];
          res[file][i] = [type, this.__heap.idToStr[id], key, method];
        }
      }
      this.finalTraceData = res;
      return res;
    }
  }

  var proxyWrapper = function () {
    class HeapMap {
      constructor() {
        this.id = -1;
        this.objectToNode = new Map();
        this.idToNode = new Map();
        this.nodes = [];
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
        this.idToStr = { 0: "window" };
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
        // if (!this.children.hasOwnProperty(key)) {
        //   this.children[key] = [];
        // }
        // if (this.children[key].indexOf(node) == -1) {
        //   this.children[key].push(node);
        // }
        this.children[key] = node;
      }
    }

    var heap = new HeapMap();
    heap.addNode(window);

    var tracer = new __Tracer__(heap);
    window.__tracer__ = tracer;

    var logger = function (target, key, method, type) {
      if (typeof method == "function" || typeof method == "object") {
        method != null && heap.addEdge(target, key, method);
      } else {
        var n = heap.addNode(target);
        if (!window.__stackHead__) throw new Error("Stack head is null");
        if (!window.__tracedata__[window.__stackHead__])
          window.__tracedata__[window.__stackHead__] = [];
        window.__tracedata__[window.__stackHead__].push([
          type,
          n.id,
          key,
          method,
        ]);
      }
    };

    var ignoreKeys = ["__proto__", "toJSON", "apply", "call"];
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
        return true;
      },
      apply: function (target, thisArg, argumentsList) {
        if (thisArg && thisArg.__isProxy__) thisArg = thisArg.__target__;
        return Reflect.apply(target, thisArg, argumentsList);
      },
    };
    return handler;
  };

  var proxy = new Proxy(window, proxyWrapper());
  window.__proxy__ = proxy;
})();
