import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi } from "npm:viem@2.38.6";
import { privateKeyToAccount } from "npm:viem@2.38.6/accounts";
import { base } from "npm:viem@2.38.6/chains";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// SpendPermissionManager on Base mainnet
const SPEND_PERMISSION_MANAGER = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";

const spendPermissionManagerAbi = parseAbi([
  "function approveWithSignature(((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) permission, bytes signature)) external",
  "function spend(address account, address token, uint160 amount) external",
  "function isApproved((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) permission) external view returns (bool)",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const spenderPrivateKey = Deno.env.get("SPENDER_PRIVATE_KEY");
    if (!spenderPrivateKey) {
      return new Response(
        JSON.stringify({ error: "Spender wallet not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { permission, signature, amount } = body;

    if (!permission || !signature || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing permission, signature, or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[relay] Processing spend for account:", permission.account, "amount:", amount);

    const account = privateKeyToAccount(spenderPrivateKey as `0x${string}`);
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http("https://mainnet.base.org"),
    });

    // Check if permission is already approved on-chain
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

    // If not approved yet, submit approveWithSignature first
    if (!isApproved) {
      console.log("[relay] Permission not yet approved, submitting approveWithSignature...");
      const approveHash = await walletClient.writeContract({
        address: SPEND_PERMISSION_MANAGER,
        abi: spendPermissionManagerAbi,
        functionName: "approveWithSignature",
        args: [{ permission: permissionTuple, signature: signature as `0x${string}` }],
      });
      console.log("[relay] approveWithSignature tx:", approveHash);
      txHashes.push(approveHash);

      // Wait for approval tx to confirm
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      console.log("[relay] approveWithSignature confirmed");
    }

    // Submit spend call
    console.log("[relay] Submitting spend call for amount:", amount);
    const spendHash = await walletClient.writeContract({
      address: SPEND_PERMISSION_MANAGER,
      abi: spendPermissionManagerAbi,
      functionName: "spend",
      args: [
        permissionTuple.account,
        permissionTuple.token,
        BigInt(amount),
      ],
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
      JSON.stringify({ error: error.message || "Transaction relay failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
