import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

// Load the proto file
const packageDefinition = loadSync("./geyser.proto");
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const Geyser = protoDescriptor.geyser.Geyser;

// Create client
const client = new Geyser(
  "go.getblock.io:443",
  grpc.credentials.createSsl()
);

// Create metadata with access token
const metadata = new grpc.Metadata();
metadata.add("x-access-token", "e9c3aa2e0986456f8e5a2f3e1cf2e208");

// Make Ping call to test
client.GetLatestBlockhash({}, metadata, (err, response) => {
  if (err) console.error("Ping error:", err);
  else console.log("Ping response:", response);
});