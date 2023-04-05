var grpc = require("@grpc/grpc-js");
var messages = require("./proto/analyzer_pb");
var services = require("./proto/analyzer_grpc_pb");
var fs = require("fs");
var _ = require("lodash");

function JSONtoPB(json, url) {
  var fileaccess = _.map(json, (value, key) => {
    var fa = new messages.Fileaccess();
    fa.setName(key);
    for (var v of value.state) {
      v = JSON.parse(v);
      var la = new messages.Lineaccess();
      la.setType(v[0]);
      la.setRoot(v[1]);
      la.setKey(v[2]);
      if (typeof v[3] === "object") v[3] = JSON.stringify(v[3]);
      la.setValue(v[3]);
      fa.addLines(la);
    }
    for (var v of value.fetches) {
      var fe = new messages.Fetches();
      fe.setUrl(v[0]);
      fe.setType(v[1]);
      fa.addFetches(fe);
    }
    return fa;
  });
  var pageaccess = new messages.Pageaccess();
  pageaccess.setFilesList(fileaccess);
  pageaccess.setName(url);
  return pageaccess;
}

class AZClient {
  constructor(address) {
    console.log(`AZClient created with address ${address}...`);
    this.client = new services.AnalyzerClient(
      address,
      grpc.credentials.createInsecure(),
      { "grpc.max_receive_message_length": 1024 * 1024 * 10 }
    );
    console.log("AZClient created...");
  }

  async storesignature(sigobj, url) {
    return new Promise((resolve, reject) => {
      var request = JSONtoPB(sigobj, url);
      this.client.storesignature(request, function (err, response) {
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }
}

module.exports = AZClient;
