import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/time-off?groupId=xxx&userId=yyy — get time-off requests
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')
  const userId = searchParams.get('userId')
  const pendingOnly = searchParams.get('pending')

  if (!groupId) return NextResponse.json({ requests: [] })

  let query = supabase
    .from('time_off_requests')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (userId) query = query.eq('user_id', userId)
  if (pendingOnly === 'true') query = query.eq('status', 'pending')

  const { data } = await query
  return NextResponse.json({ requests: data || [] })
}

// POST /api/time-off — create a time-off request
export async function POST(req: NextRequest) {
  const { groupId, userId, userEmail, date, reason } = await req.json()

  if (!groupId || !userId || !date) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { error } = await supabase.from('time_off_requests').insert({
    group_id: groupId,
    user_id: userId,
    user_email: userEmail,
    date,
    reason: reason || '',
    status: 'pending',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/time-off — approve or deny a request (Admin/Owner only)
export async function PATCH(req: NextRequest) {
  const { id, status, userRole } = await req.json()

  if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can manage requests' }, { status: 403 })
  }
  if (status !== 'approved' && status !== 'denied') {
    return NextResponse.json({ error: 'Status must be approved or denied' }, { status: 400 })
  }

  const { error } = await supabase
    .from('time_off_requests')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
