import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import { base } from 'viem/chains';
import type { Direction } from '@/types/game';

/**
 * Client for x402 advisor endpoint using Coinbase CDP Facilitator.
 * The Facilitator handles payment verification and USDC transfer on-chain,
 * while the endpoint serves inference after payment succeeds.
 *
 * Payment flow:
 * 1. POST grid/score to endpoint → gets 402 with payment instruction
 * 2. Client signs EIP-3009 transferWithAuthorization
 * 3. POST signature + nonce back to endpoint with X-PAYMENT header
 * 4. Facilitator verifies and executes USDC transfer
 * 5. Endpoint runs inference and returns result
 */

export interface AdvisorResult {
  direction: Direction | null;
  reasoning: string;
  strategy: string;
  raw: string;
}

/**
 * Ask the CDP Facilitator-backed advisor for the best next move.
 * Handles the full x402 payment flow and returns inference result.
 */
export async function askCdpFacilitatorAdvisor(opts: {
  provider: EIP1193Provider;
  address: `0x${string}`;
  grid: number[][];
  score: number;
  endpointUrl: string; // Supabase edge function or your own endpoint
}): Promise<AdvisorResult> {
  const { provider, address, grid, score, endpointUrl } = opts;

  // Step 1: Send initial request to get payment instruction (first 402)
  console.log('[cdp-facilitator] Requesting advisor...');
  const initialReq = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grid,
      score,
    }),
  });

  // Expect 402 Payment Required with payment instruction
  if (initialReq.status !== 402) {
    if (initialReq.ok) {
      // Already paid in a previous request? Return the result directly.
      const data = await initialReq.json();
      return {
        direction: data.advisor?.direction || null,
        reasoning: data.advisor?.reasoning || '',
        strategy: data.advisor?.strategy || '',
        raw: data.raw || '',
      };
    }
    throw new Error(`Expected 402 from advisor, got ${initialReq.status}`);
  }

  const paymentData = await initialReq.json();
  const paymentPayload = paymentData?.paymentInstruction?.paymentPayload;

  if (!paymentPayload) {
    throw new Error('No payment instruction in 402 response');
  }

  console.log('[cdp-facilitator] Payment required:', paymentPayload);

  // Step 2: Sign the EIP-3009 transferWithAuthorization
  // The wallet client signs the authorization; the Facilitator later executes it.
  const walletClient = createWalletClient({
    account: address,
    chain: base,
    transport: custom(provider),
  });

  // Construct the EIP-3009 typed data for transferWithAuthorization
  // The Facilitator expects: from, to, value, validBefore, nonce (from authorization header)
  const nonce = Math.floor(Math.random() * 2 ** 32); // Random nonce for replay protection
  const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour

  // The to address is the Facilitator contract on Base that will execute the transfer
  const facilitatorAddress = '0x7f3da9F5A0c5Cf0b0E9f0D5d6C5b6a7f8e9d0c1b'; // Example address (replace with actual)

  const signature = await walletClient.signTypedData({
    account: address,
    domain: {
      name: 'USDC',
      version: '2',
      chainId: 8453, // Base mainnet
      verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b4Cf7Cc5243', // USDC on Base
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: address,
      to: facilitatorAddress,
      value: BigInt(paymentPayload.amount || '2000'), // Amount in smallest unit
      validAfter: BigInt(0),
      validBefore: BigInt(validBefore),
      nonce: `0x${nonce.toString().padStart(64, '0')}`,
    },
  });

  console.log('[cdp-facilitator] Signed authorization, nonce:', nonce);

  // Step 3: Send the signature back to endpoint with payment headers
  const paidReq = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment': signature, // EIP-3009 signature
      'X-Payment-Nonce': String(nonce),
    },
    body: JSON.stringify({
      grid,
      score,
      paymentSignature: signature,
      paymentNonce: nonce,
    }),
  });

  if (!paidReq.ok) {
    const errorData = await paidReq.json().catch(() => ({}));
    throw new Error(`Payment failed: ${paidReq.status} - ${errorData?.error || 'unknown'}`);
  }

  // Step 4: Parse inference result
  const result = await paidReq.json();

  if (!result.success) {
    throw new Error(`Advisor failed: ${result.error || 'unknown'}`);
  }

  console.log('[cdp-facilitator] Payment confirmed, got inference:', result.advisor);

  return {
    direction: (result.advisor?.direction?.toLowerCase() as Direction | null) || null,
    reasoning: result.advisor?.reasoning || '',
    strategy: result.advisor?.strategy || '',
    raw: result.raw || '',
  };
}
