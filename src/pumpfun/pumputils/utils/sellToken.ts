import { Keypair, PublicKey } from "@solana/web3.js";

async function sellToken(payerKeypair: Keypair, mint: PublicKey, tokenBalance: bigint, priorityFeeInSol: number, tokenAccountAddress: PublicKey, price_check_interval: number, take_profit: number, stop_loss: number, sell_slippage: number, skip_selling_if_lost_more_than: number, price_check_duration: number, auto_sell: boolean, max_sell_retries: number) {

    console.log("payerKeypair===>", payerKeypair)
    console.log("mint===>", mint)
    console.log("tokenBalance===>", tokenBalance)
    console.log("priorityFeeInSol===>", priorityFeeInSol)
    console.log("tokenAccountAddress===>", tokenAccountAddress)
    console.log("price_check_interval===>", price_check_interval)
    console.log("take_profit===>", take_profit)
    console.log("stop_loss===>", stop_loss)
    console.log("sell_slippage===>", sell_slippage)
    console.log("price_check_duration===>", price_check_duration)
    console.log("auto_sell===>", auto_sell)
    console.log("max_sell_retries===>", max_sell_retries)
}

export default sellToken;
