import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get all notification tokens where user hasn't played in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: users, error } = await supabase
      .from('miniapp_notifications')
      .select('*')
      .or(`last_played_at.is.null,last_played_at.lt.${twentyFourHoursAgo}`)

    if (error) {
      console.error('DB error:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${users?.length || 0} users to notify`)

    let sent = 0
    let failed = 0

    for (const user of users || []) {
      try {
        const response = await fetch(user.notification_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notificationId: crypto.randomUUID(),
            title: '🎮 Time to play 2048!',
            body: "You haven't played 2048 today. Come back and beat your high score!",
            targetUrl: 'https://onchain2048.lovable.app',
            tokens: [user.notification_token],
          }),
        })

        if (response.ok) {
          sent++
        } else {
          const errText = await response.text()
          console.warn(`Failed to notify ${user.id}:`, errText)
          
          // If token is invalid (410 Gone or 404), remove it
          if (response.status === 410 || response.status === 404) {
            await supabase.from('miniapp_notifications').delete().eq('id', user.id)
            console.log(`Removed invalid token for ${user.id}`)
          }
          failed++
        }
      } catch (err) {
        console.error(`Error notifying ${user.id}:`, err)
        failed++
      }
    }

    return new Response(
      JSON.stringify({ sent, failed, total: users?.length || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
