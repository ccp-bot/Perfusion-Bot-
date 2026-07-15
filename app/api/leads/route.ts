import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role so we can always save the lead even if the table has RLS. Falls back to anon.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Where lead notifications are sent.
const NOTIFY_EMAIL = 'cliftonmarschel@gmail.com'

// POST /api/leads — a prospect submitted the contact form on the landing page.
export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const name = (body.name || '').trim()
  const email = (body.email || '').trim()
  const org = (body.org || '').trim()
  const message = (body.message || '').trim()

  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 })
  }

  // 1) Always save the lead so nothing is ever lost (retry without org/message if the columns differ).
  const row: Record<string, any> = { name, email, org: org || null, message: message || null, created_at: new Date().toISOString() }
  let { error }: any = await admin.from('leads').insert(row)
  if (error) { const { error: e2 } = await admin.from('leads').insert({ name, email }); error = e2 }
  if (error) return NextResponse.json({ error: 'Could not submit right now — please email us directly.' }, { status: 500 })

  // 2) Best-effort email notification (only if Resend is configured; the lead is already saved regardless).
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'COR Leads <onboarding@resend.dev>',
          to: [NOTIFY_EMAIL],
          reply_to: email,
          subject: `New COR lead: ${name}${org ? ` (${org})` : ''}`,
          text: `New interest in COR:\n\nName: ${name}\nEmail: ${email}\nOrganization: ${org || '—'}\n\nMessage:\n${message || '—'}`,
        }),
      })
    } catch { /* email is optional — the lead is saved in the database */ }
  }

  return NextResponse.json({ success: true })
}
