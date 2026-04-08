import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function parseRotation(rules: string): 'daily' | 'weekly' {
  const lower = (rules || '').toLowerCase()
  if (lower.includes('every day') || lower.includes('everyday') || lower.includes('rotates every') || lower.includes('per weekday')) {
    return 'daily'
  }
  return 'weekly'
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T12:00:00').getDay()
  return day === 0 || day === 6
}

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export async function POST(req: NextRequest) {
  const { groupId, userRole, members, shiftTypes, timeOffDates, startDate, weeks } = await req.json()

  if (!groupId || !members || !shiftTypes) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const numWeeks = weeks || 6
  const rawStart = new Date((startDate || new Date().toISOString().split('T')[0]) + 'T12:00:00')
  const start = getMondayOf(rawStart)

  // Build member lookup by lowercase name AND by userId
  const membersByName: { [name: string]: { userId: string, email: string } } = {}
  const membersById: { [userId: string]: { name: string, email: string } } = {}
  const allMemberIds: string[] = []

  for (const m of members) {
    const name = (m.name || m.email).toLowerCase()
    membersByName[name] = { userId: m.userId, email: m.email }
    membersById[m.userId] = { name, email: m.email }
    allMemberIds.push(m.userId)
  }

  // Build time-off lookup
  const timeOffSet = new Set<string>()
  for (const t of (timeOffDates || [])) {
    timeOffSet.add(`${(t.name || '').toLowerCase()}:${t.date}`)
  }

  // Load shift configs from DB
  const { data: dbShiftTypes } = await supabase
    .from('shift_types')
    .select('*')
    .eq('group_id', groupId)
    .order('sort_order', { ascending: true })

  const shiftConfigs = (dbShiftTypes || []).map((st: any) => ({
    name: st.name,
    eligible: (st.eligible || []).map((e: string) => e.toLowerCase()),
    perDay: st.per_day || 1,
    rules: st.rules || '',
  }))

  // Generate all dates
  const allDates: string[] = []
  for (let d = 0; d < numWeeks * 7; d++) {
    const day = new Date(start)
    day.setDate(day.getDate() + d)
    allDates.push(day.toISOString().split('T')[0])
  }

  // Build the schedule: memberAssignment[date][memberName] = shiftName
  const memberAssignment: { [date: string]: { [member: string]: string } } = {}
  const dayAssigned: { [date: string]: Set<string> } = {}

  for (const date of allDates) {
    memberAssignment[date] = {}
    dayAssigned[date] = new Set()
  }

  // Process each shift type with round-robin
  for (const config of shiftConfigs) {
    if (config.eligible.length === 0) continue

    const rotation = parseRotation(config.rules)
    const isWeekdayOnly = config.rules.toLowerCase().includes('weekday')
    let rotIndex = 0

    if (rotation === 'weekly') {
      for (let w = 0; w < numWeeks; w++) {
        const weekDates = allDates.slice(w * 7, (w + 1) * 7)

        // Pick one person for this week
        const assigned: string[] = []
        let attempts = 0
        while (assigned.length < config.perDay && attempts < config.eligible.length) {
          const candidate = config.eligible[rotIndex % config.eligible.length]
          rotIndex++
          attempts++

          // Check time-off for any day this week
          if (weekDates.some(d => timeOffSet.has(`${candidate}:${d}`))) continue
          // Check not already assigned a different weekly shift this week
          const alreadyBooked = weekDates.some(d => dayAssigned[d]?.has(candidate))
          if (alreadyBooked) continue

          assigned.push(candidate)
        }

        for (const date of weekDates) {
          if (isWeekdayOnly && isWeekend(date)) continue
          for (const person of assigned) {
            dayAssigned[date].add(person)
            memberAssignment[date][person] = config.name
          }
        }
      }
    } else {
      // Daily rotation
      for (const date of allDates) {
        if (isWeekdayOnly && isWeekend(date)) continue

        const assigned: string[] = []
        let attempts = 0
        while (assigned.length < config.perDay && attempts < config.eligible.length) {
          const candidate = config.eligible[rotIndex % config.eligible.length]
          rotIndex++
          attempts++

          if (timeOffSet.has(`${candidate}:${date}`)) continue
          if (dayAssigned[date].has(candidate)) continue

          assigned.push(candidate)
        }

        for (const person of assigned) {
          dayAssigned[date].add(person)
          memberAssignment[date][person] = config.name
        }
      }
    }
  }

  // Now write to DB: for EVERY member on EVERY date, upsert or delete
  let totalSaved = 0
  let totalDeleted = 0

  for (const date of allDates) {
    for (const m of members) {
      const name = (m.name || m.email).toLowerCase()
      const assignedShift = memberAssignment[date][name] || null

      // Check if entry already exists
      const { data: existing } = await supabase
        .from('schedules')
        .select('id, shift_type')
        .eq('group_id', groupId)
        .eq('user_id', m.userId)
        .eq('date', date)

      if (assignedShift) {
        if (existing && existing.length > 0) {
          // Delete all but keep one, then update it
          const keepId = existing[0].id
          if (existing.length > 1) {
            const extraIds = existing.slice(1).map((e: any) => e.id)
            await supabase.from('schedules').delete().in('id', extraIds)
          }
          if (existing[0].shift_type !== assignedShift) {
            await supabase.from('schedules').update({ shift_type: assignedShift }).eq('id', keepId)
          }
        } else {
          await supabase.from('schedules').insert({
            group_id: groupId,
            user_id: m.userId,
            user_email: m.email,
            date,
            shift_type: assignedShift,
          })
        }
        totalSaved++
      } else {
        // No shift — delete any existing entries for this member+date
        if (existing && existing.length > 0) {
          const ids = existing.map((e: any) => e.id)
          await supabase.from('schedules').delete().in('id', ids)
          totalDeleted += ids.length
        }
      }
    }
  }

  console.log(`Schedule generated: ${totalSaved} assigned, ${totalDeleted} cleared, ${allDates.length} days, ${shiftConfigs.length} shifts`)

  if (totalSaved === 0) {
    return NextResponse.json({
      error: 'No entries generated. Check shift configs and eligible members.',
      debug: {
        shifts: shiftConfigs.map(c => ({ name: c.name, eligible: c.eligible, perDay: c.perDay })),
        members: Object.keys(membersByName),
      }
    }, { status: 500 })
  }

  return NextResponse.json({ success: true, entriesGenerated: totalSaved, entriesCleared: totalDeleted })
}
