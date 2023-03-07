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

var startTime = Date.now();
// var input = fs.readFileSync(
//   "/run/user/99542426/goelayu/tempdir/insttmp113093710",
//   "utf-8"
// );
// console.log(`size of input: ${input.length}`);
// client.rewrite(
//   { content: input, type: "javascript", name: "test.js" },
//   function (err, response) {
//     if (err) {
//       console.log(err);
//     } else {
//       console.log(`size of output: ${response.content.length}`);
//       console.log(`end time: ${Date.now() - startTime} ms`);
//     }
//   }
// );

var client = new rewriter.Rewriter(
  "localhost:1234",
  grpc.credentials.createInsecure()
);

var starttimes = [];

for (var i = 1; i <= 1; i++) {
  starttimes.push(Date.now());
  let iter = i;
  console.log(`sending request ${iter}...`);
  client.test({ content: "test" }, function (err, response) {
    if (err) {
      console.log(err);
    } else {
      console.log(
        `end time of ${iter}: ${Date.now() - starttimes[iter - 1]} ms`
      );
    }
  });
}
