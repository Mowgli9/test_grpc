import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import {
    CommitmentLevel,
    SubscribeRequest,
    SubscribeUpdate,
} from "@triton-one/yellowstone-grpc";
import * as fs from "fs";
import bs58 from "bs58";
import { Connection } from "@solana/web3.js"; // NEW: Import the Connection class

// Load the proto file
const packageDefinition = loadSync("./geyser.proto");
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const Geyser = protoDescriptor.geyser.Geyser;

// Create client (using TLS for port 443)
const client = new Geyser(
    "go.getblock.io:443",
    grpc.credentials.createSsl()
);

// Create metadata with access token
const metadata = new grpc.Metadata();
metadata.add("x-access-token", "e9c3aa2e0986456f8e5a2f3e1cf2e208");
const solanaConnection = new Connection(
    
);

// Optional accumulators for average RPC latency
let accumRPC_Latency = 0;
let countRPC = 0;
// Your subscription request object
const REQUEST = {
    accounts: {},
    slots: {},
    transactions: {
        raydiumLiquidityPoolV4: {
            vote: false,
            failed: false,
            signature: undefined,
            accountInclude: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
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
    commitment: CommitmentLevel.PROCESSED,
};
let test = true

async function handleStream(request) {
    return new Promise((resolve, reject) => {
        const stream = client.subscribe(metadata);

        stream.on("data", async (data) => {
            try {
                // Check if the update contains a transaction
                if (data.transaction) {
                    if (test) {
                        fs.writeFileSync('output.json', JSON.stringify(data, null, 2), 'utf8');
                        test = false
                    }
                    const txn = data.transaction;
                    let signature = "";

                    // Decode the transaction signature. It might be a Buffer or an object.
                    if (txn.transaction && txn.transaction.signature) {
                        const sigField = txn.transaction.signature;
                        if (Buffer.isBuffer(sigField)) {
                            signature = convertSignature(sigField);
                            // signature = sigField.toString("base64");
                        } else if (sigField.data) {
                            // Convert object to Buffer
                            signature = Buffer.from(sigField.data).toString("base64");
                        } else {
                            signature = String(sigField);
                        }
                    }

                    // Compute the createdAt timestamp in milliseconds.
                    const createdAtSec =
                        typeof data.createdAt.seconds === "number"
                            ? data.createdAt.seconds
                            : Number(data.createdAt.seconds.low);
                    const createdAtNanos = data.createdAt.nanos || 0;
                    const createdTime = createdAtSec * 1000 + Math.floor(createdAtNanos / 1e6);

                    // Record the current time when the transaction is processed.
                    const currentTime = Date.now();

                    // Calculate latency (in ms)
                    const latency = currentTime - createdTime;

                    console.log("==========================================");
                    console.log(`Transaction Signature: ${(signature)}`);
                    console.log(`Slot: ${txn.slot ? txn.slot.toString() : "N/A"}`);
                    console.log(`Transaction Created Time: ${new Date(createdTime).toISOString()}`);
                    console.log(`Received at: ${new Date(currentTime).toISOString()}`);
                    console.log(`Latency: ${latency}ms`);
                    console.log("==========================================\n");
                    // NEW: If using PROCESSED commitment, wait a moment so the RPC can have a valid blockTime.
                    if (REQUEST.commitment === CommitmentLevel.PROCESSED) {
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    }

                    // NEW: Fetch the transaction details from the Solana RPC.
                    const transactionData = await solanaConnection.getTransaction(signature, {
                        maxSupportedTransactionVersion: 0,
                        commitment: "confirmed", // or "finalized" based on your needs
                    });

                    if (transactionData && transactionData.blockTime) {
                        const rpcBlockTime = transactionData.blockTime * 1000; // Convert seconds to ms
                        const rpcLatency = currentTime - rpcBlockTime;

                        console.log(`RPC Block Time: ${new Date(rpcBlockTime).toISOString()}`);
                        console.log(`Latency based on RPC block time: ${rpcLatency}ms`);

                        // Optionally accumulate RPC latency for average calculations
                        accumRPC_Latency += rpcLatency;
                        countRPC++;
                        console.log(`Average RPC Latency so far: ${accumRPC_Latency / countRPC}ms`);
                    } else {
                        console.log("No RPC blockTime available for transaction:", signature);
                    }
                    console.log("==========================================\n");
                    // Optional: Process or log additional transaction details as needed.
                }
            } catch (err) {
                console.error("Error processing data:", err);
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

        // Send subscribe request
        stream.write(request, (err) => {
            if (err) {
                console.error("Write error:", err);
                reject(err);
            }
        });
    });
}

function convertSignature(signature) {
    return bs58.encode(Buffer.from(signature));
}

async function subscribeCommand() {
    while (true) {
        try {
            await handleStream(REQUEST);
        } catch (err) {
            console.error("Error:", err);
            console.error("Restarting subscription in 1 second...");
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

// Test the ping function (unary call) for comparison
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

// Run the tests: first test ping, then start subscription
testPing().then(() => {
    console.log("Starting subscription for transactions...");
    subscribeCommand();
});
