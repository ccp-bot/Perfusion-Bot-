import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/notifications?userId=xxx — get unread notifications
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) return NextResponse.json({ notifications: [] })

  const { data, error } = await supabase
    .from('notifications')
    .select('id, group_id, category, message, created_by_email, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ notifications: [] })
  return NextResponse.json({ notifications: data || [] })
}

// PATCH /api/notifications — mark notifications as read
export async function PATCH(req: NextRequest) {
  const { userId, category } = await req.json()

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  let query = supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (category) {
    query = query.eq('category', category)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// POST /api/notifications — create notifications for group members (called internally)
export async function POST(req: NextRequest) {
  const { groupId, category, message, createdByEmail, createdByUserId } = await req.json()

  if (!groupId || !category) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Get all group members (rows may store only an email, with user_id null).
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, email')
    .eq('group_id', groupId)

  if (!members || members.length === 0) return NextResponse.json({ success: true })

  // Resolve each member's user_id — look up emails in profiles when the membership row has no user_id.
  const emailsToResolve = members.filter(m => !m.user_id && m.email).map(m => (m.email || '').toLowerCase())
  const emailToId: Record<string, string> = {}
  if (emailsToResolve.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('user_id, email').in('email', emailsToResolve)
    for (const p of (profs || [])) if (p.email && p.user_id) emailToId[p.email.toLowerCase()] = p.user_id
  }

  const targetIds = new Set<string>()
  for (const m of members) {
    const uid = m.user_id || emailToId[(m.email || '').toLowerCase()]
    if (uid && uid !== createdByUserId) targetIds.add(uid)
  }
  if (targetIds.size === 0) return NextResponse.json({ success: true })

  const notifications = Array.from(targetIds).map(uid => ({
    user_id: uid,
    group_id: groupId,
    category,
    message: message || `New ${category} entry added`,
    created_by_email: createdByEmail || 'Unknown',
    read: false,
  }))

  const { error } = await supabase.from('notifications').insert(notifications)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
