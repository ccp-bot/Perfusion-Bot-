import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/schedule?groupId=xxx&weekStart=yyyy-mm-dd — get schedule for a week
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')
  const weekStart = searchParams.get('weekStart')
  const getShiftTypes = searchParams.get('shiftTypes')

  if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 })

  // Return shift types if requested
  if (getShiftTypes === 'true') {
    const { data } = await supabase
      .from('shift_types')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order', { ascending: true })

    const { data: groupData } = await supabase
      .from('groups')
      .select('schedule_rules')
      .eq('id', groupId)
      .single()

    return NextResponse.json({ shiftTypes: data || [], generalRules: groupData?.schedule_rules || '' })
  }

  if (!weekStart) return NextResponse.json({ error: 'Missing weekStart' }, { status: 400 })

  // Get schedule entries for the week (7 days from weekStart)
  const endDate = new Date(weekStart)
  endDate.setDate(endDate.getDate() + 7)

  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('group_id', groupId)
    .gte('date', weekStart)
    .lt('date', endDate.toISOString().split('T')[0])

  if (error) return NextResponse.json({ entries: [] })
  return NextResponse.json({ entries: data || [] })
}

// POST /api/schedule — set a schedule entry (Admin/Owner only)
export async function POST(req: NextRequest) {
  const { groupId, userId, userEmail, date, shiftType, userRole, action, shiftTypeName, shiftTypeColor, sortOrder } = await req.json()

  if (!groupId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Manage shift types
  if (action === 'add_shift_type') {
    if (userRole !== 'owner' && userRole !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const { error } = await supabase.from('shift_types').insert({
      group_id: groupId,
      name: shiftTypeName,
      color: shiftTypeColor || '#4a5568',
      sort_order: sortOrder || 0,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'delete_shift_type') {
    if (userRole !== 'owner' && userRole !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const { error } = await supabase.from('shift_types').delete().eq('id', shiftTypeName)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'save_shift_configs') {
    if (userRole !== 'owner' && userRole !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    // shiftTypeName is reused to pass configs object: { [shiftName]: { eligible, perDay, rules } }
    // shiftTypeColor is reused to pass generalRules string
    const configs = shiftTypeName as any
    const generalRules = shiftTypeColor as string

    // Update each shift type with its config
    for (const [name, config] of Object.entries(configs as {[k: string]: any})) {
      await supabase
        .from('shift_types')
        .update({ eligible: config.eligible, per_day: config.perDay, rules: config.rules })
        .eq('group_id', groupId)
        .eq('name', name)
    }

    // Save general rules on the group
    await supabase.from('groups').update({ schedule_rules: generalRules }).eq('id', groupId)

    return NextResponse.json({ success: true })
  }

  // Set schedule entry
  if (userRole !== 'owner' && userRole !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if ((!userId && !userEmail) || !date) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Upsert — match by email (user_id may be NULL)
  const query = supabase
    .from('schedules')
    .select('id')
    .eq('group_id', groupId)
    .eq('date', date)

  if (userEmail) query.eq('user_email', userEmail)
  else query.eq('user_id', userId)

  const { data: existing } = await query.single()

  if (existing) {
    if (!shiftType) {
      // Remove entry
      await supabase.from('schedules').delete().eq('id', existing.id)
    } else {
      await supabase.from('schedules').update({ shift_type: shiftType }).eq('id', existing.id)
    }
  } else if (shiftType) {
    await supabase.from('schedules').insert({
      group_id: groupId,
      user_id: userId,
      user_email: userEmail,
      date,
      shift_type: shiftType,
    })
  }

  return NextResponse.json({ success: true })
}
