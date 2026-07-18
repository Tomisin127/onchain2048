import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import { base } from 'viem/chains';
import { wrapFetchWithPayment } from 'x402-fetch';
import { Direction } from '@/types/game';

const VENICE_URL = 'https://api.venice.ai/api/v1/chat/completions';

export interface AdvisorResult {
  direction: Direction | null;
  reason: string;
  raw: string;
}

/**
 * Ask the Venice AI advisor for the best next move, paying via x402 (USDC on Base)
 * from the caller's connected wallet. Returns a suggested direction plus reasoning.
 */
export async function askVeniceAdvisor(opts: {
  provider: EIP1193Provider;
  address: `0x${string}`;
  grid: number[][];
  score: number;
}): Promise<AdvisorResult> {
  const { provider, address, grid, score } = opts;

  const walletClient = createWalletClient({
    account: address,
    chain: base,
    transport: custom(provider),
  });

  // x402-fetch handles 402 responses by signing an EIP-3009 USDC authorization
  // and re-sending the request with the X-PAYMENT header.
  const fetchWithPay = wrapFetchWithPayment(fetch, walletClient as any);

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
