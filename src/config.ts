import dotenv from "dotenv";

dotenv.config();

const getParamOrExit = (name: string) => {
  const param = process.env[name];
  if (!param) {
    console.error(`Required config param '${name}' missing`);

    process.exit(1);
  }
  return param;
};

// EVN CONFIG --
export const X_TOKEN = getParamOrExit("X_TOKEN");
export const RPC_ENDPOINT = getParamOrExit("RPC_ENDPOINT");
export const PRIVATE_KEY = getParamOrExit("PRIVATE_KEY");
export const NEXT_BLOCK_API = getParamOrExit("NEXT_BLOCK_API");
export const GRPC_ENDPOINT = getParamOrExit("GRPC_ENDPOINT");
