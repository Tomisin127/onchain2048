# x402 Advisor Integration Guide

This document explains the two x402 payment approaches for AI inference in the 2048 game:

1. **Direct x402 Gateway** (`x402Advisor.ts`) — Simple, browser-based, zero backend
2. **Coinbase CDP Facilitator** (`cdpFacilitatorAdvisor.ts` + `supabase/functions/x402-facilitator-advisor`) — Server-verified, Bazaar-discoverable

---

## Option 1: Direct x402 Gateway (Recommended for simplicity)

**Architecture:** Browser client ↔ x402 Gateway (tx402.ai)

**How it works:**
- Browser sends inference request to the gateway's `/v1/chat/completions` endpoint
- Gateway returns 402 with payment instruction (USDC on Base via EIP-3009)
- Browser signs authorization and retries with `X-PAYMENT` header
- Gateway verifies signature, executes USDC transfer on-chain
- Gateway returns inference result

**Pros:**
- No backend needed
- No service account or API key management
- Direct connection to cheap models on tx402.ai
- Per-request USDC payment (~0.2 cent per move)

**Cons:**
- Not discoverable in Bazaar (gateway is not indexed as a "service")
- Clients must already have USDC on Base
- Each request hits the gateway directly

**Implementation:**

```typescript
import { askX402Advisor } from '@/lib/x402Advisor';

const result = await askX402Advisor({
  provider: window.ethereum, // or Privy embedded wallet
  address: userAddress,
  grid: gameBoard,
  score: currentScore,
});

console.log(result.direction); // 'up', 'down', 'left', 'right', or null
console.log(result.reason);    // Strategy explanation
```

**Client file:** `src/lib/x402Advisor.ts`
**Gateway:** https://tx402.ai (supports models: minimax, claude, glm, kimi, etc.)

---

## Option 2: Coinbase CDP Facilitator (Bazaar-discoverable)

**Architecture:** Browser client → Your Backend (Edge Function) ↔ Coinbase CDP Facilitator ↔ Inference Service

**How it works:**
1. Browser sends inference request to your endpoint
2. Endpoint returns 402 with payment instruction
3. Browser signs EIP-3009 `transferWithAuthorization`
4. Browser sends signature to endpoint with `X-Payment` header
5. Endpoint verifies signature with Coinbase CDP Facilitator
6. Facilitator executes USDC transfer on-chain
7. Endpoint runs inference (can be any Bazaar service or your own)
8. Endpoint returns inference + proof of payment (Facilitator tx hash)

**Pros:**
- Endpoint becomes discoverable in x402 Bazaar once settlements succeed
- Can compose any inference service (Claude, Anthropic, custom models)
- Server can enforce rate limits, logging, analytics
- Payment is verified and on-chain before inference runs
- Automatic indexing in Agentic.Market once live

**Cons:**
- Requires Supabase/backend setup
- Needs Coinbase CDP Facilitator API key (`CDP_FACILITATOR_API_KEY`)
- Slightly more latency (backend hop + Facilitator verification)

**Implementation:**

```typescript
import { askCdpFacilitatorAdvisor } from '@/lib/cdpFacilitatorAdvisor';

const result = await askCdpFacilitatorAdvisor({
  provider: window.ethereum,
  address: userAddress,
  grid: gameBoard,
  score: currentScore,
  endpointUrl: 'https://your-project.supabase.co/functions/v1/x402-facilitator-advisor',
});

console.log(result.direction);    // 'up', 'down', 'left', 'right', or null
console.log(result.reasoning);    // Why this move
console.log(result.strategy);     // Strategy type used
```

**Endpoint file:** `supabase/functions/x402-facilitator-advisor/index.ts`
**Client file:** `src/lib/cdpFacilitatorAdvisor.ts`
**Inference model:** Pluggable (uses Agentic.Market services by default)

---

## Setup Instructions

### Direct x402 Gateway (Option 1)

1. No setup needed — just use `askX402Advisor()` in Game2048.tsx
2. User wallet must have ≥ 0.01 USDC on Base (for ~50 moves)
3. Optional: Switch model by editing `MODEL` constant in `x402Advisor.ts`

```typescript
const MODEL = 'glm'; // or 'claude', 'kimi', etc.
// See: GET https://tx402.ai/v1/models for available models
```

### Coinbase CDP Facilitator (Option 2)

1. **Get Facilitator API Key:**
   - Go to https://coinbase.com/developer-platform
   - Create an organization and API key
   - Save `CDP_FACILITATOR_API_KEY` to project env vars

2. **Set environment variable in Supabase:**
   ```bash
   supabase secrets set CDP_FACILITATOR_API_KEY=your_key_here
   ```

3. **Deploy the edge function:**
   ```bash
   supabase functions deploy x402-facilitator-advisor
   ```

4. **Get endpoint URL:**
   ```
   https://your-project.supabase.co/functions/v1/x402-facilitator-advisor
   ```

5. **Update Game2048.tsx** to use the new client:
   ```typescript
   const { askCdpFacilitatorAdvisor } = await import('@/lib/cdpFacilitatorAdvisor');
   const result = await askCdpFacilitatorAdvisor({
     // ... options with endpointUrl
   });
   ```

---

## Payment Structure

Both approaches settle USDC on Base and use EIP-3009 `transferWithAuthorization`:

**USDC on Base:**
- Token: `0x833589fCD6eDb6E08f4c7C32D4f71b4Cf7Cc5243`
- Decimals: 6
- Network: Base Mainnet (`eip155:8453`)

**Pricing:**
- Direct Gateway (tx402.ai): ~0.0002-0.002 USDC per request depending on model
- CDP Facilitator: ~0.002 USDC per request (configurable in endpoint)

**Authorization Scheme:**
- Standard EIP-3009 (USDC uses this on Base)
- Buyer signs: `TransferWithAuthorization(from, to, value, validAfter, validBefore, nonce)`
- No private key needed — wallet extension signs typed data

---

## Switching Between Approaches

In `Game2048.tsx` (line ~649):

**Currently using tx402.ai:**
```typescript
const { askX402Advisor } = await import('@/lib/x402Advisor');
const result = await askX402Advisor({ provider, address, grid, score });
```

**To switch to CDP Facilitator:**
```typescript
const { askCdpFacilitatorAdvisor } = await import('@/lib/cdpFacilitatorAdvisor');
const result = await askCdpFacilitatorAdvisor({
  provider,
  address,
  grid,
  score,
  endpointUrl: 'https://your-project.supabase.co/functions/v1/x402-facilitator-advisor',
});
```

---

## Bazaar Discovery (CDP Facilitator Only)

Once your endpoint settles its first payment via Coinbase CDP Facilitator:

1. **Automatic indexing:** Service appears in [Agentic.Market](https://agentic.market)
2. **Service metadata:** Defined in endpoint's GET response (name, description, pricing)
3. **Discoverability:** Agents can query and auto-pay for your service
4. **No registration needed:** Bazaar indexes on first successful settlement

**Service metadata in endpoint:**
```typescript
const SERVICE_METADATA = {
  name: "2048 AI Advisor via x402 Facilitator",
  description: "AI-powered strategic advice for 2048 game",
  networks: ["eip155:8453"],
  pricing: { amount: "0.002", currency: "USDC" },
};
```

---

## Troubleshooting

### "Failed to fetch" with Direct Gateway
- **Cause:** CORS or header issue
- **Fix:** Already handled in `x402Advisor.ts` (strips bogus `Access-Control-Expose-Headers` from retry)

### "Payment verification failed" with CDP Facilitator
- **Cause:** Facilitator API key missing or invalid
- **Fix:** Check `CDP_FACILITATOR_API_KEY` env var in Supabase
- **Debug:** Log the Facilitator response in endpoint

### Wallet doesn't have USDC
- **Solution:** Bridge USDC from another chain, or buy USDC on Base (Coinbase, Kraken, Uniswap)

### Signature doesn't match
- **Cause:** Wrong nonce or validBefore time
- **Fix:** Ensure clock skew is <1 minute; nonce must be unique per request

---

## References

- **x402 Spec:** https://eips.ethereum.org/EIPS/eip-402
- **EIP-3009 (USDC Auth):** https://eips.ethereum.org/EIPS/eip-3009
- **Coinbase CDP:** https://docs.cdp.coinbase.com
- **Agentic.Market:** https://agentic.market
- **tx402.ai Models:** GET https://tx402.ai/v1/models
