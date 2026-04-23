import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/case-events?caseId=xxx&userId=yyy
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const caseId = searchParams.get('caseId')
  const userId = searchParams.get('userId')

  if (!caseId || !userId) {
    return NextResponse.json({ error: 'Missing caseId or userId' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('case_events')
    .select('*')
    .eq('case_id', caseId)
    .eq('user_id', userId)
    .order('event_time', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}

// POST /api/case-events — create event
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { caseId, userId, eventType, label, details, eventTime } = body

  if (!caseId || !userId || !eventType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const payload = {
    case_id: caseId,
    user_id: userId,
    event_type: eventType,
    label: label || null,
    details: details || null,
    event_time: eventTime || new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('case_events')
    .insert(payload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

// PATCH /api/case-events — update an event (e.g. add/change its note)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, userId, note, details, label } = body

  if (!id || !userId) return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })

  // Fetch current event so we can merge details
  const { data: current, error: fetchErr } = await supabase
    .from('case_events')
    .select('details')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const merged: Record<string, unknown> = { ...(current?.details || {}) }
  if (details && typeof details === 'object') Object.assign(merged, details)
  if (typeof note === 'string') merged.note = note

  const patch: Record<string, unknown> = { details: merged }
  if (typeof label === 'string') patch.label = label

  const { data, error } = await supabase
    .from('case_events')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

// DELETE /api/case-events?id=xxx&userId=yyy
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const userId = searchParams.get('userId')

  if (!id || !userId) return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })

  const { error } = await supabase
    .from('case_events')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
