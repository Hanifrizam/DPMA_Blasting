import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    const eventType = payload.type 
    
    if (!['email.opened', 'email.clicked', 'email.bounced'].includes(eventType)) {
        return new Response('Event ignored', { status: 200 })
    }

    const data = payload.data
    const email = data.to[0]
    const campaignTag = data.tags?.find((t: any) => t.name === 'campaign')?.value || 'Unknown'
    const link = data.click?.link || null

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await supabaseClient.from('email_events').insert({
        campaign_name: campaignTag,
        email: email,
        event_type: eventType,
        target_link: link
    })

    return new Response('Webhook processed successfully', { status: 200 })
  } catch (err: any) {
    return new Response(String(err), { status: 400 })
  }
})