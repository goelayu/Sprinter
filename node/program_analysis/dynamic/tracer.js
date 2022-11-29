/**
 * Tracer code that is executed at runtime.
 */

// do not create any global property,
// unless explicitly specified using the window object
(function () {
  window.__tracedata__ = {};
  window.__stackHead__ = null;

  var proxyWrapper = function () {
    class HeapMap {
      constructor() {
        this.id = -1;
        this.objectToNode = new Map();
        this.idToNode = new Map();
      }

      addNode(obj) {
        if (!this.objectToNode.has(obj)) {
          var n = new HeapNode(this.id++, obj);
          this.idToNode.set(n.id, n);
          this.objectToNode.set(obj, n);
        }
        return this.objectToNode.get(obj);
      }

      addEdge(obj1, obj2) {
        var n1 = this.addNode(obj1);
        var n2 = this.addNode(obj2);
        n1.addEdge(n2);
        return n1;
      }
    }

    class HeapNode {
      constructor(id, obj) {
        this.id = id;
        this.obj = obj;
        this.children = {};
      }

      addEdge(node, key) {
        if (!this.children.hasOwnProperty(key)) {
          this.children[key] = [];
        }
        if (this.children[key].indexOf(node) == -1) {
          this.children[key].push(node);
        }
      }
    }

    var heap = new HeapMap();
    heap.addNode(window);

    var logger = function (target, key, method,type) {
      if (typeof method == "function" || typeof method == "object") {
        method != null && heap.addEdge(target, method);
      } else {
        var n = heap.addNode(target);
        if (!window.__stackHead__) throw new Error("Stack head is null");
        if (!window.__tracedata__[window.__stackHead__])
          window.__tracedata__[window.__stackHead__] = [];
        window.__tracedata__[window.__stackHead__].push([type, n.id, key, method]);
      }
    };

    var ignoreKeys = ["__proto__"];
    var handler = {
      get: function (target, key) {
        var method = Reflect.get(target, key);
        if (typeof method === "function"
        || method === null
        || method === undefined) return method;

        if (key == "__isProxy__") return true;
        if (key == "__getTarget__") return target;

        logger(target, key, method,"read");

        var desc = Object.getOwnPropertyDescriptor(target, key);
        if (
          (desc &&
          desc.configurable == false &&
          desc.writable == false ) || (
            method && method.__isProxy__
          ) || (
            ignoreKeys.indexOf(key) != -1
          )
        ) {
          return method
        }

        var p = new Proxy(method, handler);
        return p;
      },
      set: function (target, name, value) {
        if (value && value.__isProxy__) value = value.__getTarget__;
        logger(target, name, value,"write");
        target[name] = value;
        return true;
      },
    };
    return handler;
  };

  var proxy = new Proxy(window, proxyWrapper());
  window.__proxy__ = proxy;
})();
