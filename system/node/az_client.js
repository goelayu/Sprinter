

var grpc = require('@grpc/grpc-js');
var messages = require('./proto/analyzer_pb');
var services = require('./proto/analyzer_grpc_pb');
var fs = require('fs');
var _ = require('lodash');

function JSONtoPB(json){
  var fileaccess = _.map(json, (value, key) => {
    console.log(value)
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
  return pageaccess;
}
class AZClient {
  constructor(address){
    this.client = new services.AnalyzerClient(address, grpc.credentials.createInsecure());
  }

  async storesignature(sigobj){

  }
}

function main(){
    var client = new services.AnalyzerClient('localhost:1234', grpc.credentials.createInsecure());
    var json = JSON.parse(fs.readFileSync('/run/user/99542426/goelayu/system/output/httpswww.cnblogs.compick-/state.json', 'utf8'));
    var request = JSONtoPB(json);
    // var request = new messages.Pageaccess();
    client.storesignature(request, function(err, response) {
        console.log('Error: ', err);
        console.log('Response: ', response);
    });
}

main();