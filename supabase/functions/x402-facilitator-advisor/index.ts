// x402 Inference Endpoint using Coinbase CDP Facilitator
//
// This endpoint handles x402 payments via Coinbase CDP Facilitator and returns
// inference results. The Facilitator verifies EIP-3009 transferWithAuthorization
// signatures, executes the USDC transfer on-chain, and serves the inference response.
//
// Payment flow:
// 1. Client sends inference request (grid, score, etc.)
// 2. Server returns 402 Payment Required with Facilitator payment instruction
// 3. Client signs EIP-3009 transferWithAuthorization (managed by x402 client)
// 4. x402 client sends signed auth back to server with X-PAYMENT header
// 5. Server verifies via Coinbase CDP Facilitator, executes transfer
// 6. Server runs inference and returns result
//
// The endpoint is discoverable in x402 Bazaar once settlements succeed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-payment, x-payment-nonce, x-payment-signature",
};

// Coinbase CDP Facilitator endpoint for x402 payment verification and settlement
const CDP_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

// The inference model endpoint (can be any Bazaar service or your own)
// Using Agentic.market's Claude via Anthropic for high-quality moves
const INFERENCE_MODEL_URL =
  "https://api-anthropic-ai.agentic.market/v1/messages"; // Claude 3 Opus via Bazaar

// Your service metadata for Bazaar discovery
const SERVICE_METADATA = {
  name: "2048 AI Advisor via x402 Facilitator",
  description: "AI-powered strategic advice for 2048 game, pay-per-request via USDC on Base",
  networks: ["eip155:8453"], // Base mainnet
  pricing: {
    amount: "0.002", // ~0.2 cent per move
    currency: "USDC",
    scheme: "exact",
  },
};

interface PaymentInstruction {
  paymentPayload: {
    scheme: string;
    network: string;
    token: string;
    amount: string;
    resource: string;
  };
}

interface FacilitatorPayload {
  scheme: string;
  network: string;
  token: string;
  amount: string;
  nonce: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET: Return service metadata for Bazaar discovery
  if (req.method === "GET") {
    return new Response(JSON.stringify(SERVICE_METADATA), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { grid, score, paymentSignature, paymentNonce } = body;

    if (!grid || !Array.isArray(grid) || grid.length !== 4) {
      return new Response(JSON.stringify({ error: "Invalid grid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no payment signature provided yet, return 402 with payment instruction
    if (!paymentSignature) {
      const paymentInstruction: PaymentInstruction = {
        paymentPayload: {
          scheme: "eip3009", // EIP-3009 transferWithAuthorization
          network: "eip155:8453", // Base mainnet
          token: "0x833589fCD6eDb6E08f4c7C32D4f71b4Cf7Cc5243", // USDC on Base
          amount: "2000", // 0.002 USDC (in smallest unit, 6 decimals: 2000 = 0.002)
          resource: "2048-ai-advisor",
        },
      };

      return new Response(JSON.stringify({ paymentInstruction }), {
        status: 402,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Payment-Required": "true",
        },
      });
    }

    // Payment signature received: verify with Coinbase CDP Facilitator
    console.log("[x402-advisor] Verifying payment via CDP Facilitator...");

    const facilitatorPayload: FacilitatorPayload = {
      scheme: "eip3009",
      network: "eip155:8453",
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b4Cf7Cc5243",
      amount: "2000",
      nonce: paymentNonce || "",
    };

    // Send to Facilitator for verification and execution
    const facilitatorReq = await fetch(CDP_FACILITATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CDP-Facilitator-API-Key": Deno.env.get("CDP_FACILITATOR_API_KEY") || "",
      },
      body: JSON.stringify({
        paymentSignature,
        ...facilitatorPayload,
      }),
    });

    if (!facilitatorReq.ok) {
      const errorData = await facilitatorReq.text();
      console.error("[x402-advisor] Facilitator error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Payment verification failed",
          details: errorData.slice(0, 100),
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const facilitatorResult = await facilitatorReq.json();
    console.log("[x402-advisor] Payment verified:", facilitatorResult);

    // Payment successful! Now run inference
    console.log("[x402-advisor] Running inference for grid:", grid, "score:", score);

    const boardText = grid
      .map((row) =>
        row.map((v) => (v === 0 ? "." : String(v)).padStart(4, " ")).join(" ")
      )
      .join("\n");

    const systemPrompt = `You are a 2048 strategy expert. Analyze the board and return STRICT JSON only:
{
  "direction": "up|down|left|right",
  "reasoning": "brief explanation of why",
  "strategy": "corner anchoring|monotonicity|chaining"
}

No prose outside JSON. Prioritize keeping the highest tile anchored in a corner.`;

    const userPrompt = `Score: ${score}
Board (rows top→bottom, . = empty):
${boardText}

What is the best next move?`;

    // Call inference model (using Agentic.market Anthropic endpoint as example)
    const inferenceReq = await fetch(INFERENCE_MODEL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-opus-20250219",
        max_tokens: 200,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!inferenceReq.ok) {
      const errorText = await inferenceReq.text();
      console.error("[x402-advisor] Inference error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Inference failed",
          details: errorText.slice(0, 100),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const inferenceData = await inferenceReq.json();
    const content = inferenceData?.content?.[0]?.text || "";

    // Parse the JSON response
    let parsed: Record<string, unknown> = {};
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    } catch (e) {
      console.log("[x402-advisor] JSON parse failed, using raw:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        paymentVerified: true,
        facilitatorTx: facilitatorResult?.txHash,
        advisor: {
          direction: parsed.direction || "up",
          reasoning: parsed.reasoning || content.slice(0, 200),
          strategy: parsed.strategy || "general",
        },
        raw: content,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[x402-advisor] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
