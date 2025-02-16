import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import {
    CommitmentLevel, SubscribeRequest,
    SubscribeUpdate,
} from "@triton-one/yellowstone-grpc";
import * as fs from "fs";
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

const REQUEST = {
    slots: {},
    accounts: {},
    transactions: {
        pumpfun: {
            account_include: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
            account_exclude: [],
            account_required: [],
            vote: false
        },
    },
    transactions_status: {},
    blocks: {},
    blocks_meta: { blockmetadata: {} },
    entry: {},
    accounts_data_slice: [],
    commitment: CommitmentLevel.PROCESSED
};

async function handleStream(request) {
    return new Promise((resolve, reject) => {
        const stream = client.subscribe(metadata);

        stream.on('data', async (data) => {

            try {
                if (data.transaction) {
                  
                    const createdAtSec =
                    typeof data.createdAt.seconds === "number"
                        ? data.createdAt.seconds
                        : Number(data.createdAt.seconds.low);
                const createdAtNanos = data.createdAt.nanos || 0;
                // const createdTime = createdAtSec * 1000 + Math.floor(createdAtNanos / 1e6);
        
                // Use the time when this worker starts processing
                const messageTime = createdAtSec * 1000 + createdAtNanos / 1e6;
                const now = Date.now();
                const latencyMs = now - messageTime;
        
                // Calculate stream latency (time from when the transaction was created to now)
                // const streamLatency = currentTime - createdTime;
          
                // Print results
                console.log(`Created at: ${createdAtSec}s ${createdAtNanos}ns`);
                // console.log("Created at:", createdAt);
                console.log(`Latency: ${latencyMs} ms`);

                    // Optional: Log full transaction details if needed
                    // console.log('Full Transaction Data:', JSON.stringify(txn.transaction, null, 2));
                }
            } catch (err) {
                console.log("Error processing data:", err);
            }
        });

        stream.on('error', (err) => {
            console.log("Stream error:", err);
            reject(err);
            stream.end();
        });

        stream.on('end', () => {
            resolve();
        });

        stream.on('close', () => {
            resolve();
        });

        // Send subscribe request
        stream.write(request, (err) => {
            if (err) {
                console.error("Write error:", err);
                reject(err);
            }
        });
    });
}

async function subscribeCommand() {
    while (true) {
        try {
            await handleStream(REQUEST);
        } catch (err) {
            console.log("Error:", err);
            console.error("Restarting..");
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

// Test ping function
async function testPing() {
    try {
        const response = await new Promise((resolve, reject) => {
            client.Ping({ count: 1 }, metadata, (err, response) => {
                if (err) reject(err);
                else resolve(response);
            });
        });
        console.log("Ping Response:", response);
    } catch (err) {
        console.error("Ping Error:", err);
    }
}

// Run the tests
testPing().then(() => {
    console.log("Starting subscription...");
    subscribeCommand();
});