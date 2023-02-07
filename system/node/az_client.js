

var grpc = require('@grpc/grpc-js');
var messages = require('./proto/analyzer_pb');
var services = require('./proto/analyzer_grpc_pb');
var fs = require('fs');
var _ = require('lodash');

function JSONtoPB(json,url){
  var fileaccess = _.map(json, (value, key) => {
    var fa = new messages.Fileaccess();
    fa.setName(key);
    for (var v of value){
      v = JSON.parse(v)
      var la = new messages.Lineaccess();
      la.setType(v[0]);
      la.setRoot(v[1]);
      la.setKey(v[2]);
      la.setValue(v[3]);
      fa.addLines(la);
    }
    return fa;
  });
  var pageaccess = new messages.Pageaccess();
  pageaccess.setFilesList(fileaccess);
  pageaccess.setName(url)
  return pageaccess;
}

class AZClient {
  constructor(address){
    this.client = new services.AnalyzerClient(address, grpc.credentials.createInsecure());
    console.log("AZClient created...")
  }

  async storesignature(sigobj, url){
    return new Promise((resolve, reject) => {
      var request = JSONtoPB(sigobj,url);
      this.client.storesignature(request, function(err, response) {
        if (err){
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }
}

module.exports = AZClient;