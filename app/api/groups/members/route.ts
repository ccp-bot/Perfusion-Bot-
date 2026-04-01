import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/groups/members?groupId=xxx — get all members of a group
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')

  if (!groupId) return NextResponse.json({ error: 'No group ID' }, { status: 400 })

  const { data: members, error } = await supabase
    .from('group_members')
    .select('id, user_id, role, email, created_at')
    .eq('group_id', groupId)
    .order('role', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ members: members || [] })
}
