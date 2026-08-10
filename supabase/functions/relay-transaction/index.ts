import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData } from "npm:viem@2.38.6";
import { privateKeyToAccount } from "npm:viem@2.38.6/accounts";
import { base } from "npm:viem@2.38.6/chains";
import { Attribution } from "npm:ox@0.11.3/erc8021";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPEND_PERMISSION_MANAGER = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";

// ERC-8021 attribution suffix using ox library (includes magic bytes 802180218021)
// Strip 0x prefix so it can be concatenated to existing hex calldata
const ERC_8021_SUFFIX_RAW = Attribution.toDataSuffix({
  codes: ['bc_dh0rqw67'],
});
const ERC_8021_SUFFIX = ERC_8021_SUFFIX_RAW.startsWith('0x') ? ERC_8021_SUFFIX_RAW.slice(2) : ERC_8021_SUFFIX_RAW;

const spendPermissionManagerAbi = parseAbi([
  "function approveWithSignature((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) permission, bytes signature) external",
  "function spend((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) permission, uint160 value) external",
  "function isApproved((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) permission) external view returns (bool)",
]);

// ---------------------------------------------------------------------------
// Concurrency safety: every player's move is relayed from the SAME wallet, so
// when several people play at once their transactions race for the next nonce.
// Reading the nonce with `latest` (and without serialising) hands the same
// nonce to multiple requests, so only one lands and the others fail with
// "nonce too low" / "replacement transaction underpriced" — which is exactly
// the "game stops working when several people play" report.
//
// Fixes:
//  1. A promise chain serialises nonce allocation + submission per instance.
//  2. A local counter tracks the next nonce, seeded from the PENDING count, so
//     back-to-back sends never reuse a nonce even before the previous one is
//     mined.
//  3. Nonce errors resync from the chain and retry once.
// ---------------------------------------------------------------------------
let txQueue: Promise<unknown> = Promise.resolve();
let nextNonce: number | null = null;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = txQueue.then(task, task);
  // Keep the chain alive even if a task rejects.
  txQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function sendSerialized(
  publicClient: any,
  walletClient: any,
  account: { address: `0x${string}` },
  tx: { to: `0x${string}`; data: `0x${string}` },
): Promise<`0x${string}`> {
  return enqueue(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (nextNonce === null) {
        nextNonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
      }
      const nonce = nextNonce as number;
      try {
        const hash = await walletClient.sendTransaction({ ...tx, nonce });
        nextNonce = nonce + 1;
        return hash as `0x${string}`;
      } catch (err) {
        const msg = String((err as Error)?.message || err).toLowerCase();
        const isNonceIssue =
          msg.includes("nonce") ||
          msg.includes("replacement") ||
          msg.includes("already known");
        console.error(`[relay] send failed (attempt ${attempt + 1}), nonce ${nonce}:`, msg);
        if (!isNonceIssue) throw err;
        // Resync from chain and retry with a fresh nonce.
        nextNonce = null;
        await new Promise((r) => setTimeout(r, 300 + attempt * 400));
      }
    }
    throw new Error("Relayer could not submit the transaction (nonce contention)");
  });
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const spenderPrivateKey = Deno.env.get("SPENDER_PRIVATE_KEY");
  if (!spenderPrivateKey) {
    return new Response(
      JSON.stringify({ error: "Spender wallet not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const account = privateKeyToAccount(spenderPrivateKey as `0x${string}`);

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ spenderAddress: account.address }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { permission, signature, amount } = body;

    if (!permission || !signature || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing permission, signature, or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[relay] Processing spend for account:", permission.account, "amount:", amount);

    if (permission.spender.toLowerCase() !== account.address.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: `Spender mismatch: permission has ${permission.spender}, relayer is ${account.address}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const permissionTuple = {
      account: permission.account as `0x${string}`,
      spender: permission.spender as `0x${string}`,
      token: permission.token as `0x${string}`,
      allowance: BigInt(permission.allowance),
      period: Number(permission.period),
      start: Number(permission.start),
      end: Number(permission.end),
      salt: BigInt(permission.salt),
      extraData: (permission.extraData || "0x") as `0x${string}`,
    };

    let isApproved = false;
    try {
      isApproved = await publicClient.readContract({
        address: SPEND_PERMISSION_MANAGER,
        abi: spendPermissionManagerAbi,
        functionName: "isApproved",
        args: [permissionTuple],
      }) as boolean;
    } catch (e) {
      console.log("[relay] isApproved check failed (will try approve):", e);
    }

    const txHashes: string[] = [];

    if (!isApproved) {
      console.log("[relay] Permission not yet approved, submitting approveWithSignature...");
      
      // Encode approve calldata + ERC-8021 suffix
      const approveData = encodeFunctionData({
        abi: spendPermissionManagerAbi,
        functionName: "approveWithSignature",
        args: [permissionTuple, signature as `0x${string}`],
      });
      const approveDataWithAttribution = (approveData + ERC_8021_SUFFIX) as `0x${string}`;
      
      console.log("[relay] approveWithSignature calldata with ERC-8021 attribution appended");
      
      const approveHash = await sendSerialized(publicClient, walletClient, account, {
        to: SPEND_PERMISSION_MANAGER,
        data: approveDataWithAttribution,
      });
      console.log("[relay] approveWithSignature tx:", approveHash);
      txHashes.push(approveHash);

      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log("[relay] approveWithSignature confirmed");
    }

    console.log("[relay] Submitting spend call for amount:", amount);
    
    // Encode spend calldata + ERC-8021 suffix
    const spendData = encodeFunctionData({
      abi: spendPermissionManagerAbi,
      functionName: "spend",
      args: [permissionTuple, BigInt(amount)],
    });
    const spendDataWithAttribution = (spendData + ERC_8021_SUFFIX) as `0x${string}`;
    
    console.log("[relay] spend calldata with ERC-8021 attribution appended");
    
    const spendHash = await sendSerialized(publicClient, walletClient, account, {
      to: SPEND_PERMISSION_MANAGER,
      data: spendDataWithAttribution,
    });
    console.log("[relay] ✅ spend tx:", spendHash);
    txHashes.push(spendHash);

    return new Response(
      JSON.stringify({ success: true, txHashes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[relay] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Transaction relay failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
