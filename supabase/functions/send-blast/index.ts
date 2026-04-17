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
    if (!contacts || contacts.length === 0) throw new Error("Tidak ada kontak di grup target ini.")

    const emailsToSend = contacts.map(contact => {
      const emailPayload: any = {
        from: `${settings.senderName} <${settings.senderEmail}>`,
        to: [contact.email],
        subject: campaignName,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
            <div style="background-color: #003366; padding: 25px; text-align: center; border-bottom: 5px solid #fec315;">
              <img src="https://blastingdpmaipb.web.id/logo-dpma.png" alt="Logo DPMA IPB" style="max-height: 60px; max-width: 100%;">
            </div>
            <div style="padding: 35px 30px; color: #333333; line-height: 1.6; font-size: 15px;">
              <p style="font-size: 16px; margin-bottom: 25px;">Halo <strong>${contact.name}</strong>,</p>
              <div style="margin-bottom: 30px;">
                ${messageHTML}
              </div>
            </div>
            <div style="background-color: #f4f7f6; padding: 25px 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #003366;"><strong>Direktorat Pengembangan Masyarakat Agromaritim (DPMA)</strong><br>IPB University</p>
              <p style="margin: 0;">Gedung Andi Hakim Nasoetion Lantai 1, Kampus IPB Dramaga, Bogor, Jawa Barat</p>
              <p style="margin: 20px 0 0 0; font-size: 11px; color: #94a3b8;"><em>Email ini dikirim otomatis oleh Sistem Blasting DPMA IPB. Harap tidak membalas langsung ke alamat email ini.</em></p>
            </div>
          </div>
        `
      };

      // MENYUSUN LAMPIRAN DENGAN MIME TYPE AGAR DITERIMA GMAIL
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        emailPayload.attachments = attachments.map((att: any) => ({
          filename: att.filename,
          content: String(att.content),
          content_type: att.contentType // <--- INI KUNCINYA
        }));
      }

      return emailPayload;
    });

    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(emailsToSend)
    })

    const responseData = await res.json()

    if (res.ok) {
      return new Response(JSON.stringify({ success: true, count: emailsToSend.length, data: responseData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } else {
      throw new Error(JSON.stringify(responseData))
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
