// AI advisor for the 2048 game.
// Currently backed by Lovable AI Gateway (Google Gemini) as a Claude-equivalent
// chat model. To switch to Anthropic Claude via Agentic.market's x402 endpoint,
// replace the fetch URL with the x402 gateway and add the required payment
// header — the request/response shape is OpenAI-compatible.
//
// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { grid, score } = await req.json();
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) throw new Error('LOVABLE_API_KEY not configured');

    const boardText = (grid as number[][])
      .map((row) => row.map((v) => (v === 0 ? '  .  ' : String(v).padStart(4, ' ') + ' ').padStart(5)).join(' '))
      .join('\n');

    const prompt = `You are a Claude-style AI advising a player on the game 2048.
Their current score is ${score}. Their board (rows top-to-bottom):

${boardText}

Give a short, punchy tip (max 3 sentences) about the best next move and why.
Mention one high-level strategy (corner anchoring, monotonicity, or chain building) that applies.
Be encouraging and specific to the board.`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': key,
      },
      body: JSON.stringify({
        model: 'google/gemini-3.5-flash',
        messages: [
          { role: 'system', content: 'You are a concise, encouraging 2048 strategy coach.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`AI gateway ${resp.status}: ${t}`);
    }
    const data = await resp.json();
    const advice = data?.choices?.[0]?.message?.content ?? 'No advice.';

    return new Response(JSON.stringify({ advice }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
