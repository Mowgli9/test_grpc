import * as token from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import getBondingCurvePDA from "./getBondingCurvePDA";
import tokenDataFromBondingCurveTokenAccBuffer from "./tokenDataFromBondingCurveTokenAccBuffer";
import getBuyPrice from "./getBuyPrice";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { PumpFun } from "../idl/pump-fun";
import IDL from "../idl/pump-fun.json";
import getBondingCurveTokenAccountWithRetry from "./getBondingCurveTokenAccountWithRetry";
import { Connection, SystemProgram, TransactionMessage } from "@solana/web3.js";
// import { executeJitoTx } from "../../utils/jito";
import dotenv from 'dotenv'
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import Client from "@triton-one/yellowstone-grpc";
import { executeJitoTx } from "../../../utils/jito";

dotenv.config()

const BOANDING_CURVE_ACC_RETRY_AMOUNT = 50;
const BOANDING_CURVE_ACC_RETRY_DELAY = 10;

const solanaConnection = new Connection(process.env.RPC_ENDPOINT!, 'processed');
const stakeConnection = new Connection(process.env.RPC_ENDPOINT!, 'processed')

// Constants
const ENDPOINT = process.env.GRPC_ENDPOINT!;
const TOKEN = process.env.GRPC_ENDPOINT!;


const client = new Client(ENDPOINT, undefined, {});

const keypair = web3.Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!))

// Load Pumpfun provider
const provider = new AnchorProvider(solanaConnection, new Wallet(keypair), {
  commitment: "processed",
});
const program = new Program<PumpFun>(IDL as PumpFun, provider);

const programId = new web3.PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Create transaction
const transaction = new web3.Transaction();

interface Payload {
  transaction: TransactionMessages;
}

interface TransactionMessages {
  content: string;
}

async function buyToken(
  mint: web3.PublicKey,
  connection: web3.Connection,
  keypair: web3.Keypair,
  solAmount: number,
  slippage: number,
  priorityFee?: number
) {
  try {
    console.time('timetrack');

    // Get/Create token account
    const associatedUser = await token.getAssociatedTokenAddress(mint, keypair.publicKey, false);

    // await token.getAccount(connection, associatedUser, "finalized");
    transaction.add(
      token.createAssociatedTokenAccountInstruction(keypair.publicKey, associatedUser, keypair.publicKey, mint)
    );


    const bondingCurve = getBondingCurvePDA(mint, programId);
    const associatedBondingCurve = await token.getAssociatedTokenAddress(mint, bondingCurve, true);


    const bondingCurveTokenAccount = await getBondingCurveTokenAccountWithRetry(
      connection,
      bondingCurve,
      BOANDING_CURVE_ACC_RETRY_AMOUNT,
      BOANDING_CURVE_ACC_RETRY_DELAY
    );
    // console.timeEnd('3');

    if (bondingCurveTokenAccount === null) {
      throw new Error("Bonding curve account not found");
    }
    const tokenData = tokenDataFromBondingCurveTokenAccBuffer(bondingCurveTokenAccount!.data);
    if (tokenData.complete) {
      throw new Error("Bonding curve already completed");
    }
    const SLIPAGE_POINTS = BigInt(slippage * 100);
    const solAmountLamp = BigInt(solAmount * web3.LAMPORTS_PER_SOL);
    const buyAmountToken = getBuyPrice(solAmountLamp, tokenData);
    // const buyAmountToken = BigInt(829362102);
    const buyAmountSolWithSlippage = solAmountLamp + (solAmountLamp * SLIPAGE_POINTS) / 10000n;
    // const buyAmountSolWithSlippage = 110000;

    const FEE_RECEIPT = new web3.PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");

    // request a specific compute unit budget
    const modifyComputeUnits = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 76000,
    });

    // set the desired priority fee
    const addPriorityFee = web3.ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: typeof priorityFee === "number" ? priorityFee * 1000000000 : 0.0007 * 1000000000,
      // microLamports: 8000000,
    });

    console.time('blockhash')
    const latestBlockhash = await client.getLatestBlockhash()
    console.timeEnd('blockhash')

    transaction
      .add(modifyComputeUnits)
      .add(addPriorityFee)
      .add(
        await program.methods
          .buy(new BN(buyAmountToken.toString()), new BN(buyAmountSolWithSlippage.toString()))
          .accounts({
            feeRecipient: FEE_RECEIPT,
            mint: mint,
            associatedBondingCurve: associatedBondingCurve,
            associatedUser: associatedUser,
            user: keypair.publicKey,
          })
          .transaction()
      );

    transaction.feePayer = keypair.publicKey;
    transaction.recentBlockhash = latestBlockhash.blockhash;

    const messageV0 = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: transaction.instructions,
    }).compileToV0Message()

    console.timeEnd('timetrack');

    const versionedTx = new web3.VersionedTransaction(messageV0);
    versionedTx.sign([keypair]);
    console.log('versionedTx', versionedTx)

    const jitoPromise = executeJitoTx([versionedTx], keypair, 'processed', latestBlockhash);
    // const sendTransactionPromise = stakeConnection.sendTransaction(
    //   transaction,
    //   [keypair],
    //   { skipPreflight: true, preflightCommitment: 'processed' }
    // );

    // // Run both promises in parallel
    // const [txSig, jitoResult] = await Promise.all([sendTransactionPromise, jitoPromise]);

    // if (jitoResult) {
    //   return jitoResult
    // }

  } catch (error) {
    console.error(error);
    return false
  }
}


export default buyToken;
