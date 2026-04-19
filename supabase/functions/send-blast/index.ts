import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { campaignName, targetAudience, messageHTML, settings, attachments } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let query = supabaseClient.from('contacts').select('name, email')
    if (targetAudience !== 'all') {
      query = query.eq('category', targetAudience.toLowerCase())
    }
    const { data: contacts, error: dbError } = await query

    if (dbError) throw dbError
    if (!contacts || contacts.length === 0) throw new Error("Tidak ada kontak di grup target.")

    let sentCount = 0;

    // Proses kirim satu per satu (Sekuensial)
    for (const contact of contacts) {
      const emailPayload: any = {
        from: `${settings.senderName} <${settings.senderEmail}>`,
        to: [contact.email],
        subject: campaignName,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <div style="background-color: #003366; padding: 25px; text-align: center; border-bottom: 5px solid #fec315;">
              <img src="https://blastingdpmaipb.web.id/logo-lp2ai-putihh.png" alt="Logo LP2AI" style="max-height: 60px; max-width: 100%;">
            </div>
            <div style="padding: 35px 30px; color: #333333; line-height: 1.6; font-size: 15px;">
              <p style="font-size: 16px; margin-bottom: 25px;">Halo <strong>${contact.name}</strong>,</p>
              <div style="margin-bottom: 30px;">
                ${messageHTML}
              </div>
            </div>
            <div style="background-color: #f4f7f6; padding: 25px 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #003366;"><strong>Lembaga Pengembangan Agromaritim dan Akselerasi Innopreneurship (LPA2I)</strong><br>IPB University</p>
              <p style="margin: 0;">Kampus IPB Taman Kencana Jl. Taman Kencana No.3 Babakan Bogor Tengah, Bogor 16128 agromaritim@apps.ipb.ac.id</p>
              <p style="margin: 20px 0 0 0; font-size: 11px; color: #94a3b8;"><em>Email ini otomatis dikirim oleh Sistem Blasting DPMA IPB.</em></p>
            </div>
          </div>
        `
      };

      // BYPASS TOTAL: Langsung tempel attachment dari frontend ke Resend
      if (attachments && attachments.length > 0) {
        emailPayload.attachments = attachments;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(emailPayload)
      });

      if (res.ok) sentCount++;
      
      // Jeda 200ms agar server tidak nge-hang
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (sentCount === 0 && contacts.length > 0) throw new Error("Gagal mengirim email ke Resend.");

    return new Response(JSON.stringify({ success: true, count: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})