import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { ClientEvmSigner } from '@x402/evm';
import { Direction } from '@/types/game';

const VENICE_URL = 'https://api.venice.ai/api/v1/chat/completions';

export interface AdvisorResult {
  direction: Direction | null;
  reason: string;
  raw: string;
}

/**
 * Ask the Venice AI advisor for the best next move, paying via x402 (USDC on Base)
 * from the caller's connected wallet.
 *
 * Uses the x402 **v2** protocol (`@x402/fetch` + `@x402/evm`). v2 speaks CAIP-2
 * network identifiers (e.g. `eip155:8453` for Base mainnet), which is what
 * Venice's paid endpoint now advertises in its 402 challenge. The old v1
 * `x402-fetch` package only understood the legacy `base` string and rejected
 * the `eip155:8453` response with an "invalid enum value" error.
 */
export async function askVeniceAdvisor(opts: {
  provider: EIP1193Provider;
  address: `0x${string}`;
  grid: number[][];
  score: number;
}): Promise<AdvisorResult> {
  const { provider, address, grid, score } = opts;

  // Wrap the connected browser wallet in a viem wallet client so we can sign the
  // EIP-3009 USDC "transferWithAuthorization" typed data that x402 requires.
  const walletClient = createWalletClient({
    account: address,
    chain: base,
    transport: custom(provider),
  });

  // x402 v2 only needs `address` + `signTypedData` from the buyer's signer.
  const signer: ClientEvmSigner = {
    address,
    signTypedData: (message) =>
      walletClient.signTypedData({
        account: address,
        domain: message.domain,
        types: message.types as never,
        primaryType: message.primaryType as never,
        message: message.message,
      }),
  };

  // Build a v2 client and register the EVM "exact" scheme with a wildcard
  // (`eip155:*`) so it automatically handles whatever EVM network the server
  // advertises — including Base mainnet (`eip155:8453`).
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  // Wrapped fetch: on a 402 it parses payment requirements, signs the USDC
  // authorization, and retries with the PAYMENT-SIGNATURE header.
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  const boardText = grid
    .map((row) => row.map((v) => (v === 0 ? '.' : String(v)).padStart(4, ' ')).join(' '))
    .join('\n');

  const systemMsg =
    'You are a 2048 strategy AI. Given a 4x4 board and score, respond with STRICT JSON only: ' +
    '{"direction":"up|down|left|right","reason":"..."} — no prose outside JSON. ' +
    'Prefer moves that keep the highest tile in a corner and maintain monotonic rows.';

  const userMsg = `Score: ${score}\nBoard (rows top→bottom, empty = .):\n${boardText}\n\nReturn the best move as JSON.`;

  const res = await fetchWithPay(VENICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Venice ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  // Parse direction from JSON payload, tolerating extra text.
  let direction: Direction | null = null;
  let reason = content;
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const d = String(parsed.direction || '').toLowerCase().trim();
      if (['up', 'down', 'left', 'right'].includes(d)) direction = d as Direction;
      if (parsed.reason) reason = String(parsed.reason);
    }
  } catch {
    /* fall back to keyword sniff */
  }
  if (!direction) {
    const lower = content.toLowerCase();
    for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
      if (lower.includes(d)) { direction = d; break; }
    }
  }

  return { direction, reason: reason.slice(0, 400), raw: content };
}
