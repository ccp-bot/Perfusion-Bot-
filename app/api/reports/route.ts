import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SUPER_OWNER_EMAIL = 'cliftonmarschel@gmail.com'

// POST /api/reports — a user flags a wrong COR answer (goes to the platform owner)
export async function POST(req: NextRequest) {
  const { userId, userEmail, groupId, question, corAnswer, whatsWrong, suggestedAnswer } = await req.json()
  if (!whatsWrong?.trim() && !suggestedAnswer?.trim()) {
    return NextResponse.json({ error: 'Tell us what was wrong (or the correct answer).' }, { status: 400 })
  }
  const { error } = await supabase.from('reports').insert({
    user_id: userId || null,
    user_email: userEmail || null,
    group_id: groupId || null,
    question: (question || '').slice(0, 4000),
    cor_answer: (corAnswer || '').slice(0, 8000),
    whats_wrong: (whatsWrong || '').slice(0, 4000),
    suggested_answer: (suggestedAnswer || '').slice(0, 4000),
    status: 'open',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// GET /api/reports?email=...&status=open — owner-only list of reports
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  if (email?.toLowerCase() !== SUPER_OWNER_EMAIL) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  const status = searchParams.get('status') || 'open'
  const { data, error } = await supabase
    .from('reports')
    .select('id, user_email, group_id, question, cor_answer, whats_wrong, suggested_answer, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ reports: [] })
  return NextResponse.json({ reports: data || [] })
}

// PATCH /api/reports — owner resolves/dismisses a report
export async function PATCH(req: NextRequest) {
  const { id, status, email } = await req.json()
  if (email?.toLowerCase() !== SUPER_OWNER_EMAIL) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  const { error } = await supabase.from('reports').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
