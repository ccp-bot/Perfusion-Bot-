import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const SUPER_OWNER_EMAIL = 'cliftonmarschel@gmail.com'

async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text.slice(0, 8000) || ' ' })
    return res.data[0].embedding
  } catch { return null }
}

// POST /api/teach — save a taught rule at one of three scopes
//   scope: 'personal' | 'company' | 'global'
export async function POST(req: NextRequest) {
  const { scope, text, title, userId, userEmail, groupId, userRole } = await req.json()
  const content = (text || '').toString().trim()
  if (!content) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })

  const isAdmin = userRole === 'owner' || userRole === 'admin'
  const isSuperOwner = userEmail?.toLowerCase() === SUPER_OWNER_EMAIL

  // ── Personal: a private note for this user ──
  if (scope === 'personal') {
    if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 400 })
    const embedding = await embed(content)
    const { error } = await supabase.from('documents').insert({
      content, embedding, category: 'Notes', user_id: userId,
      source_file: (title || 'Note').toString().slice(0, 200),
      institution_id: 'hospital_a', created_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, savedTo: 'your personal notes' })
  }

  // ── Company: shared with the whole group + notify teammates ──
  if (scope === 'company') {
    if (!groupId) return NextResponse.json({ error: 'You are not part of a company/group' }, { status: 400 })
    if (!isAdmin && !isSuperOwner) return NextResponse.json({ error: 'Only owners and admins can teach the whole company' }, { status: 403 })
    const embedding = await embed(content)
    const { error } = await supabase.from('documents').insert({
      content, embedding, category: 'Protocol', group_id: groupId, institution_id: groupId,
      user_id: userId || null, folder: 'Team Rules', source_file: (title || 'Team rule').toString().slice(0, 200),
      archived: false, uploaded_by: userEmail || null, created_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify every teammate (reuses the notifications table → red dot on Protocol).
    const origin = req.headers.get('origin') || req.headers.get('host') || ''
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`
    try {
      await fetch(`${baseUrl}/api/notifications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, category: 'Protocol', message: `New team rule: ${content.slice(0, 90)}`, createdByEmail: userEmail, createdByUserId: userId })
      })
    } catch { /* notify failure shouldn't block the save */ }
    return NextResponse.json({ success: true, savedTo: 'your whole company (team notified)' })
  }

  // ── Global: platform-wide knowledge for every company (super-owner only) ──
  if (scope === 'global') {
    if (!isSuperOwner) return NextResponse.json({ error: 'Only the platform owner can teach COR globally' }, { status: 403 })
    const embedding = await embed(content)
    const { error } = await supabase.from('documents').insert({
      content, embedding, category: 'Protocol', group_id: null, institution_id: 'GLOBAL',
      user_id: userId || null, folder: 'COR Global', source_file: (title || 'Global rule').toString().slice(0, 200),
      archived: false, uploaded_by: userEmail || null, created_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, savedTo: 'COR globally (all companies)' })
  }

  return NextResponse.json({ error: 'Unknown scope' }, { status: 400 })
}
