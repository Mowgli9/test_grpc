import "dotenv/config";
import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import * as fs from "fs";
import bs58 from "bs58";
import fastq from "fastq";
import { Connection } from "@solana/web3.js";

// ──────────────────────────────────────────────
// Setup gRPC client & subscription request
// ──────────────────────────────────────────────

// Load the proto file
const packageDefinition = loadSync("./geyser.proto");
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const Geyser = protoDescriptor.geyser.Geyser;

// Create gRPC client (using TLS for port 443)
const client = new Geyser(
    process.env.GEYSER_ENDPOINT || "go.getblock.io:443",
    grpc.credentials.createSsl()
);

// Create metadata with access token
const metadata = new grpc.Metadata();
metadata.add("x-access-token", process.env.X_ACCESS_TOKEN || "e9c3aa2e0986456f8e5a2f3e1cf2e208");

// Subscription request object
const REQUEST = {
    accounts: {},
    slots: {},
    transactions: {
        raydiumLiquidityPoolV4: {
            vote: false,
            failed: false,
            signature: undefined,
            accountInclude: [process.env.PUBLIC_KEY || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
            accountExclude: [],
            accountRequired: [],
        },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    ping: undefined,
    // Use string "PROCESSED" (or "CONFIRMED"/"FINALIZED") to match your desired behavior.
    commitment: "PROCESSED",
};

// ──────────────────────────────────────────────
// Setup Solana RPC connection
// ──────────────────────────────────────────────

const solanaConnection = new Connection(
    process.env.RPC_URL || "https://api.mainnet-beta.solana.com"
);

// ──────────────────────────────────────────────
// Latency accumulators (for optional average calculations)
// ──────────────────────────────────────────────

let accumStreamLatency = 0;
let countStream = 0;
let accumRPCLatency = 0;
let countRPC = 0;

// ──────────────────────────────────────────────
// Worker function: process each transaction item
// ──────────────────────────────────────────────

async function worker(item) {
    try {
        const { data, createdAtReceived } = item;
        if (!data.transaction) return;

        const txn = data.transaction;
        let signature = "";

        // Decode the transaction signature. The signature might be a Buffer or an object.
        if (txn.transaction && txn.transaction.signature) {
            const sigField = txn.transaction.signature;
            if (Buffer.isBuffer(sigField)) {
                signature = convertSignature(sigField);
            } else if (sigField.data) {
                signature = Buffer.from(sigField.data).toString("base64");
            } else {
                signature = String(sigField);
            }
        }

        // Compute the transaction's createdAt timestamp from the gRPC data.
        const createdAtSec =
            typeof data.createdAt.seconds === "number"
                ? data.createdAt.seconds
                : Number(data.createdAt.seconds.low);
        const createdAtNanos = data.createdAt.nanos || 0;
        const createdTime = createdAtSec * 1000 + Math.floor(createdAtNanos / 1e6);

        // Use the time when this worker starts processing
        const messageTime = createdAtSec * 1000 + createdAtNanos / 1e6;
        const now = Date.now();
        const latencyMs = now - messageTime;

        // Calculate stream latency (time from when the transaction was created to now)
        const streamLatency = currentTime - createdTime;
        accumStreamLatency += streamLatency;
        countStream++;
        // Print results
        console.log(`Created at: ${createdAtSec}s ${createdAtNanos}ns`);
        // console.log("Created at:", createdAt);
        console.log(`Latency: ${latencyMs} ms`);

    } catch (err) {
        console.error("Worker error:", err);
    }
}

// Create a fastq queue with a concurrency of 100
const queue = fastq.promise(worker, 100);

// Utility function to convert a Buffer signature to base58 using bs58.
function convertSignature(signatureBuffer) {
    return bs58.encode(Buffer.from(signatureBuffer));
}

// ──────────────────────────────────────────────
// gRPC Stream handler: push each transaction to the fastq queue
// ──────────────────────────────────────────────

async function handleStream(request) {
    return new Promise((resolve, reject) => {
        const stream = client.subscribe(metadata);

        stream.on("data", (data) => {
            if (data && data.transaction) {
                // Compute createdAt timestamp from the gRPC data
                const createdAtSec =
                    typeof data.createdAt.seconds === "number"
                        ? data.createdAt.seconds
                        : Number(data.createdAt.seconds.low);
                const createdAtNanos = data.createdAt.nanos || 0;
                const createdTime =
                    createdAtSec * 1000 + Math.floor(createdAtNanos / 1e6);

                // In this example, we use the parsed createdTime as our received timestamp.
                const createdAtReceived = createdTime;

                // Push the transaction data onto the worker queue
                queue.push({ data, createdAtReceived }).catch((err) => {
                    console.error("Error pushing to queue:", err);
                });
            }
        });

        stream.on("error", (err) => {
            console.error("Stream error:", err);
            reject(err);
            stream.end();
        });

        stream.on("end", () => {
            resolve();
        });

        stream.on("close", () => {
            resolve();
        });

        // Send the subscribe request
        stream.write(request, (err) => {
            if (err) {
                console.error("Write error:", err);
                reject(err);
            }
        });
    });
}

// ──────────────────────────────────────────────
// Reconnect loop for the gRPC subscription
// ──────────────────────────────────────────────

async function subscribeCommand() {
    while (true) {
        try {
            await handleStream(REQUEST);
        } catch (err) {
            console.error("Subscription error:", err);
            console.error("Reconnecting in 1 second...");
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

// ──────────────────────────────────────────────
// Optional: Test the ping (unary call) function before starting subscription
// ──────────────────────────────────────────────

async function testPing() {
    try {
        const response = await new Promise((resolve, reject) => {
            client.Ping({ count: 1 }, metadata, (err, response) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
        console.log("Ping Response:", response);
    } catch (err) {
        console.error("Ping Error:", err);
    }
}

// ──────────────────────────────────────────────
// Start the process: first ping, then subscribe for transactions
// ──────────────────────────────────────────────

testPing().then(() => {
    console.log("Starting gRPC subscription for transactions...");
    subscribeCommand();
});
