import { encodeFunctionData, erc20Abi } from 'viem';

// B20 token payment configuration (Base mainnet)
export const B20_TOKEN_ADDRESS = '0xb200000000000000000000ae0575aaf8de90b28d' as const;
export const B20_DECIMALS = 18;
export const B20_MOVE_COST_WEI = BigInt(10) ** BigInt(B20_DECIMALS); // 1 B20 per move
export const B20_RECIPIENT = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249' as const;

// Encode ERC20 transfer(recipient, amount) calldata for a move payment
export function encodeB20MoveTransfer(): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [B20_RECIPIENT, B20_MOVE_COST_WEI],
  });
}

// Format a raw B20 balance (wei) for display
export function formatB20(balanceWei: bigint): string {
  const whole = balanceWei / B20_MOVE_COST_WEI;
  const frac = balanceWei % B20_MOVE_COST_WEI;
  if (frac === BigInt(0)) return whole.toString();
  const fracStr = frac.toString().padStart(B20_DECIMALS, '0').slice(0, 4).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
