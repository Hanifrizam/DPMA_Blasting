import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS (Wajib untuk aplikasi dari browser)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Tangkap data yang dikirim dari blasting.html
    const { campaignName, targetAudience, messageHTML, settings } = await req.json()

    // 2. Hubungkan ke Database Anda untuk mengambil daftar email
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Ambil data kontak sesuai grup target
    let query = supabaseClient.from('contacts').select('name, email')
    if (targetAudience !== 'all') {
      query = query.eq('category', targetAudience.toLowerCase())
    }
    const { data: contacts, error: dbError } = await query

    if (dbError) throw dbError
    if (!contacts || contacts.length === 0) throw new Error("Tidak ada kontak di grup target ini.")

    // 3. Susun data untuk API Resend (Batching maksimal 100 email per request)
    const emailsToSend = contacts.map(contact => ({
      from: `${settings.senderName} <${settings.senderEmail}>`,
      to: [contact.email],
      subject: campaignName,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <p>Halo <strong>${contact.name}</strong>,</p>
          ${messageHTML}
          <br><hr style="border:0; border-top:1px solid #eee;">
          <p style="font-size: 12px; color: #999;">Email ini dikirim oleh Sistem DPMA IPB University.</p>
        </div>
      `
    }))

    // 4. Eksekusi pengiriman ke Resend API
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