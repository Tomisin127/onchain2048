// OnChain2048 contract integration (Base mainnet)
// The frontend keeps local game logic as the source of truth for UI
// (contract's applyMoveInternal is currently a stub). Every move still
// fires makeMove(direction, useB20) on-chain for payment + attribution,
// and we reconcile the on-chain score from MoveMade events.

import { encodeFunctionData, decodeEventLog, maxUint256, erc20Abi, parseAbiItem } from 'viem';
import type { Direction } from '@/types/game';

export const ONCHAIN_2048_ADDRESS = '0xaBF31EC13598625Db0B918579249e51513ea07d7' as const;

// Move costs (mirrors contract defaults; updateCosts can change these on-chain).
// Note: new contract sets B20 cost = 10 * 1e18 (10 B20 per move).
export const CONTRACT_MOVE_COST_ETH_WEI = BigInt('100000000000000'); // 0.0001 ETH
export const CONTRACT_MOVE_COST_B20_WEI = BigInt(10) * BigInt(10) ** BigInt(18); // 10 B20

// Direction encoding for makeMove(uint8 direction, ...)
export const DIRECTION_TO_UINT: Record<Direction, number> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
};

export const ONCHAIN_2048_ABI = [
  {
    type: 'function',
    name: 'makeMove',
    stateMutability: 'payable',
    inputs: [
      { name: 'direction', type: 'uint8' },
      { name: 'useB20', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'startNewGame',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getGameState',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [
      { name: 'board', type: 'uint128' },
      { name: 'score', type: 'uint256' },
      { name: 'gameOver', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'moveCostETH',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'moveCostB20',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'MoveMade',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'direction', type: 'uint8', indexed: false },
      { name: 'newBoard', type: 'uint128', indexed: false },
      { name: 'newScore', type: 'uint256', indexed: false },
      { name: 'gameOver', type: 'bool', indexed: false },
      { name: 'moveData', type: 'string', indexed: false },
    ],
  },
] as const;

export const MOVE_MADE_EVENT = parseAbiItem(
  'event MoveMade(address indexed player, uint8 direction, uint128 newBoard, uint256 newScore, bool gameOver, string moveData)'
);

export function encodeMakeMove(direction: Direction, useB20: boolean): `0x${string}` {
  return encodeFunctionData({
    abi: ONCHAIN_2048_ABI,
    functionName: 'makeMove',
    args: [DIRECTION_TO_UINT[direction], useB20],
  });
}

export function encodeStartNewGame(): `0x${string}` {
  return encodeFunctionData({
    abi: ONCHAIN_2048_ABI,
    functionName: 'startNewGame',
    args: [],
  });
}

// ERC20 approve(contract, MAX) — used to grant unlimited B20 spending to the
// game contract so subsequent moves don't require a second signature.
export function encodeB20Approve(): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [ONCHAIN_2048_ADDRESS, maxUint256],
  });
}

export function encodeB20Allowance(owner: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, ONCHAIN_2048_ADDRESS],
  });
}

export { decodeEventLog };
