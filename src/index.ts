import Client, {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeUpdate,
  SubscribeUpdateTransaction,
} from "@triton-one/yellowstone-grpc";
import {
  Message,
  CompiledInstruction,
} from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { ClientDuplexStream } from "@grpc/grpc-js";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { GRPC_ENDPOINT, PRIVATE_KEY, RPC_ENDPOINT } from "./config";
import buyToken from "./pumpfun/pumputils/utils/buyToken";

// Constants
const RPC = RPC_ENDPOINT;
const TOKEN = undefined;
const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_FUN_CREATE_IX_DISCRIMINATOR = Buffer.from([
  24, 30, 200, 40, 5, 28, 7, 119,
]);
// ✅ Properly formatted URL
const connection = new Connection(RPC, {
  commitment: "processed",
});
const COMMITMENT = CommitmentLevel.PROCESSED;
let already_bought = false;
const payerKeypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const solIn = 0.005;
const priorityFee = 0.0005;
let streamRef: ClientDuplexStream<SubscribeRequest, SubscribeUpdate> | null =
  null;

// Configuration
const FILTER_CONFIG = {
  programIds: [PUMP_FUN_PROGRAM_ID],
  instructionDiscriminators: [PUMP_FUN_CREATE_IX_DISCRIMINATOR],
};

const ACCOUNTS_TO_INCLUDE = [
  {
    name: "mint",
    index: 0,
  },
];

// Type definitions
interface FormattedTransactionData {
  signature: string;
  slot: string;
  [accountName: string]: string;
}

// Main function
async function main(): Promise<void> {
  const client = new Client(GRPC_ENDPOINT, TOKEN, {});
  const stream = await client.subscribe();
  const request = createSubscribeRequest();

  try {
    await sendSubscribeRequest(stream, request);
    console.log(
      "Geyser connection established - watching new Pump.fun mints. \n"
    );
    await handleStreamEvents(stream);
  } catch (error) {
    console.error("Error in subscription process:", error);
    stream.end();
  }
}

// Helper functions
function createSubscribeRequest(): SubscribeRequest {
  return {
    accounts: {},
    slots: {},
    transactions: {
      pumpFun: {
        accountInclude: FILTER_CONFIG.programIds,
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    commitment: COMMITMENT,
    accountsDataSlice: [],
    ping: undefined,
  };
}

function sendSubscribeRequest(
  stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>,
  request: SubscribeRequest
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.write(request, (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function handleStreamEvents(
  stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>
): Promise<void> {
  streamRef = stream; // Store stream reference

  return new Promise<void>((resolve, reject) => {
    stream.on("data", handleData);
    stream.on("error", (error: Error) => {
      console.error("Stream error:", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      console.log("Stream ended");
      resolve();
    });
    stream.on("close", () => {
      console.log("Stream closed");
      resolve();
    });
  });
}

async function handleData(data: SubscribeUpdate) {
  if (
    !isSubscribeUpdateTransaction(data) ||
    !data.filters.includes("pumpFun")
  ) {
    return;
  }
  console.log("Transaction detected at ", data.createdAt);
  const transaction_ = data.transaction?.transaction ?? undefined;
  const formattedSignature_ = convertSignature(
    transaction_?.signature ?? new Uint8Array()
  );
  console.log(`https://solscan.io/tx/${formattedSignature_.base58}`);
  const transaction = data.transaction?.transaction;
  const message = transaction?.transaction?.message;

  if (!transaction || !message) {
    return;
  }

  const matchingInstruction = message.instructions.find(
    matchesInstructionDiscriminator
  );
  if (!matchingInstruction) {
    return;
  }

  const formattedSignature = convertSignature(transaction.signature);
  const formattedData = formatData(
    message,
    formattedSignature.base58,
    data.transaction.slot
  );
  const currentTime = new Date();
  if (formattedData) {
    console.log({ CURRENT_TIME: currentTime });
    console.log(
      "======================================💊 New Pump.fun Mint Detected!======================================"
    );
    console.table(formattedData);
    console.log(
      "======================================*START BUYING PROCESS=================================================================="
    );
    if (already_bought) {
      console.log("Already bought the token");
    } else {
      try {
        const sig = await buyToken(
          new PublicKey(formattedData.mint),
          connection,
          payerKeypair,
          solIn,
          20,
          priorityFee
        );
        already_bought = true;

        if (streamRef) {
          console.log("Closing GRPC stream after successful buy");
          streamRef.end();
          process.exit(0); // Exit the process cleanly
        }

        // After successful buy, close the stream
      } catch (error) {
        console.error("Error during buy process:", error);
      }
    }

    console.log("\n");
  }
}

function isSubscribeUpdateTransaction(
  data: SubscribeUpdate
): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
  return (
    "transaction" in data &&
    typeof data.transaction === "object" &&
    data.transaction !== null &&
    "slot" in data.transaction &&
    "transaction" in data.transaction
  );
}

function convertSignature(signature: Uint8Array): { base58: string } {
  return { base58: bs58.encode(Buffer.from(signature)) };
}

function formatData(
  message: Message,
  signature: string,
  slot: string
): FormattedTransactionData | undefined {
  const matchingInstruction = message.instructions.find(
    matchesInstructionDiscriminator
  );

  if (!matchingInstruction) {
    return undefined;
  }

  const accountKeys = message.accountKeys;
  const includedAccounts = ACCOUNTS_TO_INCLUDE.reduce<Record<string, string>>(
    (acc, { name, index }) => {
      const accountIndex = matchingInstruction.accounts[index];
      const publicKey = accountKeys[accountIndex];
      acc[name] = new PublicKey(publicKey).toBase58();
      return acc;
    },
    {}
  );

  return {
    signature,
    slot,
    ...includedAccounts,
  };
}

function matchesInstructionDiscriminator(ix: CompiledInstruction): boolean {
  return (
    ix?.data &&
    FILTER_CONFIG.instructionDiscriminators.some((discriminator) =>
      Buffer.from(discriminator).equals(ix.data.slice(0, 8))
    )
  );
}

main().catch((err) => {
  console.error("Unhandled error in main:", err);
  process.exit(1);
});
