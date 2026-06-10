import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPER_OWNER = 'cliftonmarschel@gmail.com'

// Uses the service-role key to list every auth user. Owner-only.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/admin/users — list all users with name, tier, and signup date
export async function GET(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Not configured (missing service role key).' }, { status: 500 })
  }

  // Verify the caller is the super owner via their session token.
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user || user.email?.toLowerCase() !== SUPER_OWNER) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Pull every auth user (paginated).
  const authUsers: any[] = []
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    authUsers.push(...data.users)
    if (data.users.length < 1000) break
    page++
  }

  // Enrich with display names and hospital memberships.
  const { data: profiles } = await admin.from('profiles').select('user_id, email, display_name')
  const { data: members } = await admin.from('group_members').select('user_id, email, role, group_id')
  const { data: groups } = await admin.from('groups').select('id, name')

  const groupName = (id: string) => (groups || []).find(g => g.id === id)?.name || 'Unknown'

  const users = authUsers.map(u => {
    const emailLower = (u.email || '').toLowerCase()
    const profile = (profiles || []).find(p => p.user_id === u.id || (p.email && p.email.toLowerCase() === emailLower))
    const userGroups = (members || [])
      .filter(m => m.user_id === u.id || (m.email && m.email.toLowerCase() === emailLower))
      .map(m => ({ name: groupName(m.group_id), role: m.role }))
    return {
      id: u.id,
      email: u.email,
      name: profile?.display_name || null,
      createdAt: u.created_at,
      groups: userGroups,
    }
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  return NextResponse.json({ users })
}
