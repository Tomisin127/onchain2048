import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import type { ClientEvmSigner } from '@x402/evm';
import { Direction } from '@/types/game';

// BlockRun (https://blockrun.ai) is an x402 v2 AI gateway that gates its
// OpenAI-compatible /api/v1/chat/completions endpoint with a *per-request* 402
// challenge, settling USDC on Base (eip155:8453) through the Coinbase CDP
// facilitator. It returns the 402 directly on the inference call — exactly what
// wrapFetchWithPayment expects — with no account, API key, or session handshake.
//
// BlockRun does NOT send CORS headers, so the browser cannot call blockrun.ai
// directly (the request fails and you get a blank result). Instead we hit a
// SAME-ORIGIN path that is transparently reverse-proxied to
// https://blockrun.ai/api/v1/* — via a Vercel rewrite in production and a Vite
// dev-server proxy locally (see vercel.json and vite.config.ts). Because it is
// same-origin there is no CORS/preflight at all, while the wallet still signs
// the x402 payment on the client.
const X402_URL = '/x402/blockrun/chat/completions';

// Cheap, fast model that reliably emits strict JSON — plenty for a tiny move
// decision. See GET /x402/blockrun/models (proxied) for the live list.
const MODEL = 'openai/gpt-4o-mini';

export interface AdvisorResult {
  direction: Direction | null;
  reason: string;
  raw: string;
}

/**
 * Ask an x402-gated AI advisor for the best next move, paying per request via
 * x402 (USDC on Base) from the caller's connected wallet.
 *
 * Uses the x402 **v2** protocol (`@x402/fetch` + `@x402/evm`). v2 speaks CAIP-2
 * network identifiers (e.g. `eip155:8453` for Base mainnet), which is what the
 * gateway advertises in its 402 challenge.
 */
export async function askX402Advisor(opts: {
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

  // The @x402/fetch retry logic sets `Access-Control-Expose-Headers` as a
  // *request* header on the paid retry (it is actually a response-only header).
  // Because that header name is not in the gateway's `Access-Control-Allow-Headers`
  // allow-list, the browser's CORS preflight for the retry is rejected and fetch
  // throws a bare "Failed to fetch". Strip it from any outgoing request so the
  // preflight only advertises headers the gateway actually allows (Content-Type,
  // X-Payment, etc.). We also bind to window.fetch to avoid Illegal invocation.
  const patchedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = input as { headers?: Headers };
    if (req && typeof req === 'object' && req.headers && typeof req.headers.delete === 'function') {
      try {
        req.headers.delete('Access-Control-Expose-Headers');
      } catch {
        /* headers immutable — ignore, request will still be attempted */
      }
    }
    return window.fetch(input, init);
  }) as typeof fetch;

  // Wrapped fetch: on a 402 it parses payment requirements, signs the USDC
  // authorization, and retries with the X-PAYMENT header.
  const fetchWithPay = wrapFetchWithPayment(patchedFetch, client);

  const boardText = grid
    .map((row) => row.map((v) => (v === 0 ? '.' : String(v)).padStart(4, ' ')).join(' '))
    .join('\n');

  const systemMsg =
    'You are a 2048 strategy AI. Given a 4x4 board and score, respond with STRICT JSON only: ' +
    '{"direction":"up|down|left|right","reason":"..."} — no prose outside JSON. ' +
    'Prefer moves that keep the highest tile in a corner and maintain monotonic rows.';

  const userMsg = `Score: ${score}\nBoard (rows top→bottom, empty = .):\n${boardText}\n\nReturn the best move as JSON.`;

  const res = await fetchWithPay(X402_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.2,
      // Cap output tokens to keep the per-request USDC cost tiny — we only need
      // a short JSON object back.
      max_tokens: 150,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`x402 advisor ${res.status}: ${text.slice(0, 200)}`);
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
