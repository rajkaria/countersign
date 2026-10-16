export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_TESTNET_CIRCLE_CHAIN = "ARC-TESTNET";
export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
export const ARC_TESTNET_USDC_DECIMALS = 6;

/** New financial authority is limited to direct canonical USDC payments on Arc testnet.
 * Manifest callers provide their schema-required review metadata; permits and Circle
 * configurations provide their own network fields. Read-only reconciliation does not
 * call this guard, so disabling a network never erases an existing operation identity.
 */
export function assertTestnetExecutionNetwork(input: {
  chainId: number | string;
  token: string;
  sourceChainId?: number | string;
  destinationChainId?: number | string;
  circleChain?: string;
  tokenDecimals?: number;
  testnet?: boolean;
}) {
  const supportedChain = String(ARC_TESTNET_CHAIN_ID);
  if (
    String(input.chainId) !== supportedChain ||
    (input.sourceChainId !== undefined && String(input.sourceChainId) !== supportedChain) ||
    (input.destinationChainId !== undefined && String(input.destinationChainId) !== supportedChain) ||
    input.token.toLowerCase() !== ARC_TESTNET_USDC ||
    (input.circleChain !== undefined && input.circleChain !== ARC_TESTNET_CIRCLE_CHAIN) ||
    (input.tokenDecimals !== undefined && input.tokenDecimals !== ARC_TESTNET_USDC_DECIMALS) ||
    (input.testnet !== undefined && input.testnet !== true)
  )
    throw new Error(
      "Arc testnet only: new authorization and submission require chain 5042002, ARC-TESTNET, and canonical 6-decimal USDC; mainnet and cross-chain execution are disabled.",
    );
}
