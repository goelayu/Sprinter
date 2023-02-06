

var grpc = require('@grpc/grpc-js');
var messages = require('./proto/analyzer_pb');
var services = require('./proto/analyzer_grpc_pb');

function main(){
    var client = new services.AnalyzerClient('localhost:1234', grpc.credentials.createInsecure());
    var request = new messages.Pageaccess();
    client.storesignature(request, function(err, response) {
        console.log('Error: ', err);
        console.log('Response: ', response);
    });
}

main();