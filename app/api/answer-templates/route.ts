import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Answer-format templates are stored in `documents` with a distinct category and NO embedding
// (so they never appear in RAG retrieval). source_file = the topic, content = the format.
const CAT = 'ResponseTemplate'

// GET /api/answer-templates?groupId=&userId= — list this group's (or user's) templates
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')
  const userId = searchParams.get('userId')
  let q = supabase.from('documents').select('id, source_file, content, created_at').eq('category', CAT).order('created_at', { ascending: false })
  if (groupId) q = q.eq('group_id', groupId)
  else if (userId) q = q.eq('user_id', userId)
  else return NextResponse.json({ templates: [] })
  const { data, error } = await q
  if (error) return NextResponse.json({ templates: [] })
  const templates = (data || []).map(d => ({ id: d.id, topic: d.source_file || '', format: d.content || '' }))
  return NextResponse.json({ templates })
}

// POST /api/answer-templates — create { topic, format, groupId, userId, userEmail, userRole }
export async function POST(req: NextRequest) {
  const { topic, format, groupId, userId, userEmail, userRole } = await req.json()
  if (!topic?.trim() || !format?.trim()) return NextResponse.json({ error: 'A topic and a format are required' }, { status: 400 })
  if (groupId && userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can create company templates' }, { status: 403 })
  }
  const { data, error } = await supabase.from('documents').insert({
    content: format.trim(), embedding: null, category: CAT,
    source_file: topic.trim().slice(0, 200),
    group_id: groupId || null, institution_id: groupId || 'hospital_a',
    user_id: userId || null, uploaded_by: userEmail || null, created_at: new Date().toISOString(),
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}

// PATCH /api/answer-templates — { id, topic?, format? }
export async function PATCH(req: NextRequest) {
  const { id, topic, format } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const update: Record<string, any> = {}
  if (topic !== undefined) update.source_file = String(topic).trim().slice(0, 200)
  if (format !== undefined) update.content = String(format).trim()
  const { error } = await supabase.from('documents').update(update).eq('id', id).eq('category', CAT)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/answer-templates — { id }
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('documents').delete().eq('id', id).eq('category', CAT)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
