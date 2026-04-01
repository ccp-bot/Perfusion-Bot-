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

  // Get all group members except the person who made the change
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .not('user_id', 'is', null)

  if (!members || members.length === 0) return NextResponse.json({ success: true })

  // Create a notification for each member (except the creator)
  const notifications = members
    .filter(m => m.user_id !== createdByUserId)
    .map(m => ({
      user_id: m.user_id,
      group_id: groupId,
      category,
      message: message || `New ${category} entry added`,
      created_by_email: createdByEmail || 'Unknown',
      read: false,
    }))

  if (notifications.length === 0) return NextResponse.json({ success: true })

  const { error } = await supabase.from('notifications').insert(notifications)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
