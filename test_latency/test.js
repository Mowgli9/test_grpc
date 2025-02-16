
import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";

const client = new Client(`https://solana-yellowstone-grpc.rpcfast.net:443`, " ", undefined);
const REQUEST = {
    slots: {},
    accounts: {},
    transactions: {
        pumpFun: {
            accountInclude: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
            accountExclude: [],
            accountRequired: [],
            vote: false,
        },
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: { blockmetadata: {} },
    entry: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.PROCESSED,
    entry: {},
};

async function handleStream(client, args) {
    const stream = await client.subscribe();

    const streamClosed = new Promise((resolve, reject) => {
        stream.on("error", (err) => {
            console.log("Error:", err);
            reject(err);
            stream.end();
        });
        stream.on("end", () => {
            resolve();
        });
        stream.on("close", () => {
            resolve();
        });
    });

    stream.on("data", async (data) => {
        try {
            const blockhash = data.blockMeta.blockhash;
            const parentBlockhash = data.blockMeta.parentBlockhash;
            const blockTime = data.blockMeta.blockTime.timestamp * 1e3;
            const blockSlot = data.blockMeta.slot;
            const timestamp = Date.now();
            const latency = timestamp - blockTime;
            console.log(`Blockhash : ${blockhash}`);
            console.log(`Parent Blockhash : ${parentBlockhash}`);
            console.log(`Block Time : ${blockTime}`);
            console.log(`Block Slot : ${blockSlot}`);
            console.log(`Latency : ${latency}ms`);
        } catch (err) {
            if (err) {
                console.log("Error:", err);
            }
        }
    });

    // Send subscribe request
    await new Promise((resolve, reject) => {
        stream.write(args, (err) => {
            if (err === null || err === undefined) {
                resolve();
            } else {
                reject(err);
            }
        });
    }).catch((reason) => {
        console.error("Error:", reason);
        throw reason;
    });

    await streamClosed;
}

async function subscribeCommand(client, args) {
    while (true) {
        try {
            await handleStream(client, args);
        } catch (err) {
            console.log("Error:", err);
            console.error("Restarting..");
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

subscribeCommand(client, REQUEST);


