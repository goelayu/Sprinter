/**
 * Tracer code that is executed at runtime.
 */

// do not create any global property, 
// unless explicitly specified using the window object
(function () {
  
  window.__tracedata__ = {};

  var proxyWrapper = function (){

    class HeapMap {
      constructor(){
        this.id = -1;
        this.objectToNode = new Map();
      }

      addNode(obj){
        if (!this.objectToNode.has(obj)){
          var n = new HeapNode(this.id++, obj);
          this.objectToNode.set(obj, n);
        }
        return this.objectToNode.get(obj);
      }

      addEdge(obj1, obj2){
        var n1 = this.addNode(obj1);
        var n2 = this.addNode(obj2);
        n1.addEdge(n2);
      }
    }

    class HeapNode {
      constructor(id,obj){
        this.id = id;
        this.obj = obj;
        this.children = new Set();
      }

      addEdge(node){
        this.children.add(node);
      }
    }

    var logger = function(target, key, method){


    };

    var ignoreKeys = [
      "__proto__",
    ];
    var handler = {
      get: function (target, key) {
        var method = Reflect.get(target, key);
        if (typeof method === "function")
          return method;

        if (key == "__isProxy__") return true;
        
        typeof method != "object" ? logger(target, key, method) : null;

        if (method && method.__isProxy__) return method;

        var p = new Proxy(method, handler);
        return p;
      },
      set: function (target, name, value) {
        target[name] = value;
        return true;
      }
    };
    return new Proxy({}, handler);
  }

})();