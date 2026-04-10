import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/profile?userId=xxx — get user profile
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  return NextResponse.json({ profile: data || null })
}

// POST /api/profile — create or update profile
export async function POST(req: NextRequest) {
  const { userId, email, displayName } = await req.json()

  if (!userId || !displayName) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('profiles')
      .insert({ user_id: userId, email, display_name: displayName })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// GET /api/profile?groupId=xxx&all=true — get all profiles for a group's members
export async function PUT(req: NextRequest) {
  const { groupId } = await req.json()

  if (!groupId) return NextResponse.json({ profiles: {} })

  // Get group members
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, email')
    .eq('group_id', groupId)

  if (!members || members.length === 0) return NextResponse.json({ profiles: {} })

  const userIds = members.filter(m => m.user_id).map(m => m.user_id)
  const memberEmails = members.filter(m => m.email).map(m => m.email)
  // Also collect lowercased emails for case-insensitive matching
  const memberEmailsLower = memberEmails.map(e => e.toLowerCase())

  // Fetch profiles by user_id
  const { data: profilesById } = userIds.length > 0
    ? await supabase.from('profiles').select('user_id, display_name, email').in('user_id', userIds)
    : { data: [] }

  // Also fetch profiles by email (both original case and lowercase for matching)
  const { data: profilesByEmail } = memberEmails.length > 0
    ? await supabase.from('profiles').select('user_id, display_name, email').in('email', [...new Set([...memberEmails, ...memberEmailsLower])])
    : { data: [] }

  // Build map: userId -> displayName
  const map: {[key: string]: string} = {}
  for (const p of (profilesById || [])) {
    if (p.display_name) map[p.user_id] = p.display_name
  }
  // Fill in missing with email prefix
  for (const m of members) {
    if (m.user_id && !map[m.user_id]) {
      map[m.user_id] = (m.email || '').split('@')[0]
    }
  }

  // Build email -> displayName map (reliable even when user_id is null)
  // Index profiles by lowercase email for case-insensitive lookup
  const profileEmailIndex: {[emailLower: string]: string} = {}
  for (const p of (profilesByEmail || [])) {
    if (p.display_name && p.email) profileEmailIndex[p.email.toLowerCase()] = p.display_name
  }
  for (const p of (profilesById || [])) {
    if (p.display_name && p.email) profileEmailIndex[p.email.toLowerCase()] = p.display_name
  }

  const emailMap: {[email: string]: string} = {}
  for (const m of members) {
    if (!m.email) continue
    const emailLower = m.email.toLowerCase()
    // Priority: profile by user_id > profile by email match (case-insensitive) > email prefix
    if (m.user_id && map[m.user_id]) {
      emailMap[m.email] = map[m.user_id]
    } else if (profileEmailIndex[emailLower]) {
      emailMap[m.email] = profileEmailIndex[emailLower]
    } else {
      emailMap[m.email] = (m.email || '').split('@')[0]
    }
  }

  return NextResponse.json({ profiles: map, emailProfiles: emailMap })
}
