import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/groups?userId=xxx — get user's groups, role, and members
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const email = searchParams.get('email')

  if (!userId) return NextResponse.json({ error: 'No user ID' }, { status: 400 })

  const SUPER_OWNER = 'cliftonmarschel@gmail.com'

  // Super owner sees ALL groups without being a member
  if (email?.toLowerCase() === SUPER_OWNER) {
    const { data: allGroups } = await supabase
      .from('groups')
      .select('id, name, owner_id, created_at')
      .order('created_at', { ascending: true })

    const result = (allGroups || []).map(g => ({
      group_id: g.id,
      role: 'owner',
      email: SUPER_OWNER,
      group: g,
    }))

    return NextResponse.json({ memberships: result })
  }

  // Regular users — check memberships
  const { data: byId } = await supabase
    .from('group_members')
    .select('id, group_id, role, email')
    .eq('user_id', userId)

  let memberships = byId || []

  // Claim any pending invites by email (case-insensitive)
  if (email) {
    const { data: pending } = await supabase
      .from('group_members')
      .select('id, group_id, role, email')
      .ilike('email', email)
      .is('user_id', null)

    if (pending && pending.length > 0) {
      for (const invite of pending) {
        await supabase
          .from('group_members')
          .update({ user_id: userId })
          .eq('id', invite.id)
      }
      memberships = [...memberships, ...pending]
    }
  }

  const groupIds = memberships.map(m => m.group_id)
  let groups: any[] = []
  if (groupIds.length > 0) {
    const { data } = await supabase
      .from('groups')
      .select('id, name, owner_id, created_at')
      .in('id', groupIds)
    groups = data || []
  }

  const result = memberships.map(m => ({
    ...m,
    group: groups.find(g => g.id === m.group_id) || null
  }))

  return NextResponse.json({ memberships: result })
}

// POST /api/groups — create a new group
export async function POST(req: NextRequest) {
  const { userId, email, name } = await req.json()

  if (!userId || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Only the platform owner can create groups
  if (email !== 'cliftonmarschel@gmail.com') {
    return NextResponse.json({ error: 'Only the platform owner can create groups' }, { status: 403 })
  }

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({ name, owner_id: userId })
    .select()
    .single()

  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 })

  // Super owner is not added as a member — they manage from above
  if (email?.toLowerCase() !== 'cliftonmarschel@gmail.com') {
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: userId, email: email || null, role: 'owner' })
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({ group })
}

// PATCH /api/groups — invite member, change role, or rename group
export async function PATCH(req: NextRequest) {
  const { userId, action, groupId, targetEmail, newRole, newName, userEmail } = await req.json()

  if (!userId || !groupId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const isSuperOwner = userEmail?.toLowerCase() === 'cliftonmarschel@gmail.com'

  // Verify requester role (super owner bypasses)
  let requesterRole = 'owner'
  if (!isSuperOwner) {
    const { data: requester } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single()

    if (!requester) return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })
    requesterRole = requesterRole
  }

  if (action === 'rename') {
    if (requesterRole !== 'owner') return NextResponse.json({ error: 'Only owners can rename groups' }, { status: 403 })
    const { error } = await supabase.from('groups').update({ name: newName }).eq('id', groupId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'invite') {
    if (requesterRole === 'worker') return NextResponse.json({ error: 'Workers cannot invite members' }, { status: 403 })
    if (!targetEmail) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    // Check if already a member by email
    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('email', targetEmail)
      .single()

    if (existing) return NextResponse.json({ error: 'User is already a member of this group' }, { status: 400 })

    const role = newRole || 'worker'
    if (role === 'admin' && requesterRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can add admins' }, { status: 403 })
    }
    if (role === 'owner') return NextResponse.json({ error: 'Cannot add another owner' }, { status: 403 })

    // Insert with email, user_id will be claimed when they log in
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, email: targetEmail, role, user_id: null })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'change_role') {
    if (requesterRole !== 'owner') return NextResponse.json({ error: 'Only owners can change roles' }, { status: 403 })
    if (!targetEmail || !newRole) return NextResponse.json({ error: 'Email and role required' }, { status: 400 })
    if (newRole === 'owner') return NextResponse.json({ error: 'Cannot assign owner role' }, { status: 403 })

    const { error } = await supabase
      .from('group_members')
      .update({ role: newRole })
      .eq('group_id', groupId)
      .eq('email', targetEmail)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE /api/groups — remove a member
export async function DELETE(req: NextRequest) {
  const { userId, groupId, targetEmail, userEmail } = await req.json()

  if (!userId || !groupId || !targetEmail) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const isSuperOwner = userEmail?.toLowerCase() === 'cliftonmarschel@gmail.com'

  let requesterRole = 'owner'
  if (!isSuperOwner) {
    const { data: requester } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single()

    if (!requester || requester.role === 'worker') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    requesterRole = requester.role
  }

  // Check target's role
  const { data: target } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('email', targetEmail)
    .single()

  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner') return NextResponse.json({ error: 'Cannot remove the group owner' }, { status: 403 })
  if (requesterRole === 'admin' && target.role === 'admin') {
    return NextResponse.json({ error: 'Admins cannot remove other admins' }, { status: 403 })
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('email', targetEmail)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
