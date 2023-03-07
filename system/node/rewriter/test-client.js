const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const packageDefinition = protoLoader.loadSync("./rewriter.proto", {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const fs = require("fs");

var rewriter = grpc.loadPackageDefinition(packageDefinition).rewriter;

var client = new rewriter.Rewriter(
  "localhost:1234",
  grpc.credentials.createInsecure()
);

var input = fs.readFileSync(
  "/run/user/99542426/goelayu/tempdir/insttmp1082188931",
  "utf-8"
);
console.log(`size of input: ${input.length}`);
client.rewrite(
  { content: input, type: "javascript", name: "test.js" },
  function (err, response) {
    if (err) {
      console.log(err);
    } else {
      console.log(`size of output: ${response.content.length}`);
    }
  }
);
