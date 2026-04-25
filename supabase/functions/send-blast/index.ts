import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handler untuk pre-flight request CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Menangkap payload dari frontend termasuk explicitEmails (sistem kloter)
    const { campaignName, targetAudience, messageHTML, settings, attachments, explicitEmails } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Inisialisasi Query untuk mendapatkan nama responden
    let query = supabaseClient.from('contacts').select('name, email')
    
    // [LOGIKA CHUNKING]: Jika frontend mengirim daftar email spesifik, gunakan itu
    if (explicitEmails && Array.isArray(explicitEmails) && explicitEmails.length > 0) {
      query = query.in('email', explicitEmails)
    } else if (targetAudience !== 'all') {
      query = query.eq('category', targetAudience.toLowerCase())
    }
    
    const { data: contacts, error: dbError } = await query

    if (dbError) throw dbError
    if (!contacts || contacts.length === 0) throw new Error("Tidak ada kontak di grup target.")

    // [MODIFIKASI KUNCI]: Menyusun Array untuk Resend BATCH API
    // Kita mempertahankan template HTML LP2AI kebanggaan kamu
    const batchPayload = contacts.map(contact => {
      const emailPayload: any = {
        from: `${settings.senderName} <${settings.senderEmail}>`,
        to: [contact.email],
        subject: campaignName,
        // INJEKSI TRACKING: Memberikan label agar laporan dibuka/diklik bisa masuk ke tabel email_events
        tags: [{ name: 'campaign', value: campaignName }],
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

      // Menambahkan lampiran jika ada
      if (attachments && attachments.length > 0) {
        emailPayload.attachments = attachments;
      }

      return emailPayload;
    });

    // Eksekusi SATU KALI tembakan paralel menggunakan Endpoint Batch Resend (Maks 100 email/kloter)
    // Cara ini sangat aman dari error 546 karena prosesnya sangat cepat
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(batchPayload)
    });

    const resData = await res.json();

    if (!res.ok) {
      throw new Error(resData.message || JSON.stringify(resData));
    }

    // Menghitung jumlah yang berhasil masuk antrian Resend
    const sentCount = resData.data ? resData.data.length : contacts.length;

    return new Response(JSON.stringify({ success: true, count: sentCount, data: resData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Critical Error in send-blast function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})