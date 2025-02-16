import { Connection } from "@solana/web3.js";
import { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { RPC_ENDPOINT } from "../config";







export const ENDPOINT = process.env.GRPC_ENDPOINT!;
export const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_FUN_CREATE_IX_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
export const COMMITMENT = CommitmentLevel.PROCESSED;
export const solanaConnection = new Connection(RPC_ENDPOINT!, 'processed');
export const FILTER_CONFIG = {
    programIds: [PUMP_FUN_PROGRAM_ID],
    instructionDiscriminators: [PUMP_FUN_CREATE_IX_DISCRIMINATOR]
};
export const ACCOUNTS_TO_INCLUDE = [{
    name: "mint",
    index: 0
}];

export interface FormattedTransactionData {
    signature: string;
    slot: string;
    mint: string;
}