// Scans Base mainnet for $B20 Transfer events, collects every address that ever
// touched the token, reads their current balances via Multicall3, and stores the
// non-zero holders so the app can render a live holder leaderboard.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RPC = "https://mainnet.base.org";
const B20 = "0xb200000000000000000000ae0575aaf8de90b28d";
const DEPLOY_BLOCK = 48381016;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const CHUNK = 9999;
const CONCURRENCY = 8;
const MIN_REFRESH_SECONDS = 90;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function getLogs(from: number, to: number): Promise<any[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await rpc("eth_getLogs", [{
        address: B20,
        topics: [TRANSFER_TOPIC],
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
      }]);
    } catch (_e) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return [];
}

// balanceOf(address) selector
function balanceOfCall(addr: string): string {
  return "0x70a08231" + addr.slice(2).toLowerCase().padStart(64, "0");
}

// Multicall3 aggregate3((address target, bool allowFailure, bytes callData)[])
function encodeAggregate3(addresses: string[]): string {
  const w = (v: number | bigint) => v.toString(16).padStart(64, "0");
  const n = addresses.length;
  // Each Call3 tuple: target, allowFailure, bytesOffset(96), bytesLen(36), data(2 words)
  const TUPLE_WORDS = 6;
  const offsets: string[] = [];
  const tuples: string[] = [];
  for (let i = 0; i < n; i++) {
    offsets.push(w(32 * n + i * TUPLE_WORDS * 32));
    tuples.push(
      B20.slice(2).toLowerCase().padStart(64, "0") +
        w(1) +
        w(96) +
        w(36) +
        balanceOfCall(addresses[i]).slice(2).padEnd(128, "0"),
    );
  }
  // head: offset to array (32), then array length, offsets, tuples
  return "0x82ad56cb" + w(32) + w(n) + offsets.join("") + tuples.join("");
}


function decodeAggregate3(hex: string, count: number): bigint[] {
  const body = hex.slice(2);
  const word = (i: number) => body.slice(i * 64, (i + 1) * 64);
  const balances: bigint[] = new Array(count).fill(0n);
  // word 0 = offset to array, word 1 = length, then per-result offsets
  const arrayStart = Number(BigInt("0x" + word(0))) / 32;
  const len = Number(BigInt("0x" + word(arrayStart)));
  for (let i = 0; i < Math.min(len, count); i++) {
    const relOffset = Number(BigInt("0x" + word(arrayStart + 1 + i))) / 32;
    const tupleStart = arrayStart + 1 + relOffset;
    const success = BigInt("0x" + word(tupleStart)) === 1n;
    const dataOffset = Number(BigInt("0x" + word(tupleStart + 1))) / 32;
    const dataStart = tupleStart + dataOffset;
    const dataLen = Number(BigInt("0x" + word(dataStart)));
    if (success && dataLen >= 32) {
      balances[i] = BigInt("0x" + word(dataStart + 1));
    }
  }
  return balances;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const { data: state } = await supabase
      .from("indexer_state")
      .select("last_run_at,last_block")
      .eq("key", "b20_holders")
      .maybeSingle();

    if (!force && state?.last_run_at) {
      const age = (Date.now() - new Date(state.last_run_at).getTime()) / 1000;
      if (age < MIN_REFRESH_SECONDS) {
        return new Response(JSON.stringify({ skipped: true, ageSeconds: Math.round(age) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const latest = Number(BigInt(await rpc("eth_blockNumber", [])));

    // Full history scan: we need every address that ever held the token so the
    // ranking is complete, and the token's history is small enough to re-scan.
    const ranges: [number, number][] = [];
    for (let b = DEPLOY_BLOCK; b <= latest; b += CHUNK + 1) {
      ranges.push([b, Math.min(b + CHUNK, latest)]);
    }

    const addressSet = new Set<string>();
    const chunks = await mapLimit(ranges, CONCURRENCY, ([f, t]) => getLogs(f, t));
    for (const logs of chunks) {
      for (const log of logs) {
        const from = "0x" + String(log.topics[1]).slice(-40);
        const to = "0x" + String(log.topics[2]).slice(-40);
        if (from !== "0x0000000000000000000000000000000000000000") addressSet.add(from.toLowerCase());
        if (to !== "0x0000000000000000000000000000000000000000") addressSet.add(to.toLowerCase());
      }
    }

    const addresses = [...addressSet];
    console.log(`[b20] scanned ${ranges.length} ranges, ${addresses.length} candidate holders`);

    // Read live balances in batches through Multicall3
    const BATCH = 100;
    const rows: { address: string; balance_wei: string; updated_at: string }[] = [];
    const zero: string[] = [];
    for (let i = 0; i < addresses.length; i += BATCH) {
      const batch = addresses.slice(i, i + BATCH);
      let balances: bigint[] = [];
      try {
        const result = await rpc("eth_call", [
          { to: MULTICALL3, data: encodeAggregate3(batch) },
          "latest",
        ]);
        balances = decodeAggregate3(result, batch.length);
      } catch (e) {
        console.error("[b20] multicall failed, falling back to single calls", e);
        balances = await mapLimit(batch, CONCURRENCY, async (a) => {
          try {
            const r = await rpc("eth_call", [{ to: B20, data: balanceOfCall(a) }, "latest"]);
            return BigInt(r);
          } catch {
            return 0n;
          }
        });
      }
      batch.forEach((addr, idx) => {
        const bal = balances[idx] ?? 0n;
        if (bal > 0n) {
          rows.push({ address: addr, balance_wei: bal.toString(), updated_at: new Date().toISOString() });
        } else {
          zero.push(addr);
        }
      });
    }

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("b20_holders").upsert(rows.slice(i, i + 500), {
          onConflict: "address",
        });
        if (error) throw error;
      }
    }
    if (zero.length > 0) {
      for (let i = 0; i < zero.length; i += 500) {
        await supabase.from("b20_holders").delete().in("address", zero.slice(i, i + 500));
      }
    }

    await supabase.from("indexer_state").upsert(
      { key: "b20_holders", last_run_at: new Date().toISOString(), last_block: latest },
      { onConflict: "key" },
    );

    return new Response(JSON.stringify({ success: true, holders: rows.length, latestBlock: latest }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[b20] error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
