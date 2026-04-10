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

  // Build member lookup by lowercase display name -> email
  // Also map email prefix -> email for backwards compatibility with old eligible lists
  const membersByName: { [name: string]: { email: string } } = {}
  const allEmails: string[] = []

  for (const m of members) {
    const displayName = (m.name || m.email).toLowerCase()
    const emailPrefix = (m.email || '').split('@')[0].toLowerCase()
    membersByName[displayName] = { email: m.email }
    membersByName[emailPrefix] = { email: m.email } // fallback for old eligible lists
    allEmails.push(m.email)
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
    eligible: (st.eligible || [])
      .map((e: string) => e.toLowerCase())
      .filter((e: string) => membersByName[e]), // only keep names that map to actual members
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

  // Process weekly shifts first (so they get priority over daily shifts)
  const sortedConfigs = [...shiftConfigs].sort((a, b) => {
    const aWeekly = parseRotation(a.rules) === 'weekly' ? 0 : 1
    const bWeekly = parseRotation(b.rules) === 'weekly' ? 0 : 1
    return aWeekly - bWeekly
  })

  for (const config of sortedConfigs) {
    if (config.eligible.length === 0) continue

    const rotation = parseRotation(config.rules)
    const isWeekdayOnly = config.rules.toLowerCase().includes('weekday')
    let rotIndex = 0

    if (rotation === 'weekly') {
      for (let w = 0; w < numWeeks; w++) {
        const weekDates = allDates.slice(w * 7, (w + 1) * 7)

        const assigned: string[] = []
        let attempts = 0
        while (assigned.length < config.perDay && attempts < config.eligible.length * 2) {
          const candidate = config.eligible[rotIndex % config.eligible.length]
          rotIndex++
          attempts++

          if (weekDates.some(d => timeOffSet.has(`${candidate}:${d}`))) continue
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
      // Daily rotation: scan from rotIndex, find the first available person
      for (const date of allDates) {
        if (isWeekdayOnly && isWeekend(date)) continue

        const assigned: string[] = []
        // Try every eligible member starting from rotIndex
        for (let i = 0; i < config.eligible.length && assigned.length < config.perDay; i++) {
          const candidate = config.eligible[(rotIndex + i) % config.eligible.length]

          if (timeOffSet.has(`${candidate}:${date}`)) continue
          if (dayAssigned[date].has(candidate)) continue

          assigned.push(candidate)
        }

        // Only advance rotIndex by 1 per day (not per attempt) for true rotation
        if (assigned.length > 0) rotIndex++

        for (const person of assigned) {
          dayAssigned[date].add(person)
          memberAssignment[date][person] = config.name
        }
      }
    }
  }

  // First: delete ALL existing schedule entries for this group in this date range
  // Use email-based deletion since user_id may be NULL
  for (const email of allEmails) {
    await supabase
      .from('schedules')
      .delete()
      .eq('group_id', groupId)
      .eq('user_email', email)
      .gte('date', allDates[0])
      .lte('date', allDates[allDates.length - 1])
  }

  // Now insert fresh entries — one per member per date where they have a shift
  // Build reverse map: eligible name -> email for insertion
  const toInsert: any[] = []
  for (const date of allDates) {
    for (const [eligibleName, shiftName] of Object.entries(memberAssignment[date])) {
      const member = membersByName[eligibleName]
      if (!member) continue

      // Find the full member object to get userId
      const fullMember = members.find((m: any) => m.email === member.email)

      toInsert.push({
        group_id: groupId,
        user_id: fullMember?.userId || null,
        user_email: member.email,
        date,
        shift_type: shiftName,
      })
    }
  }

  // Batch insert in chunks of 100
  let totalSaved = 0
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100)
    const { error } = await supabase.from('schedules').insert(chunk)
    if (error) {
      return NextResponse.json({ error: 'Failed to save: ' + error.message }, { status: 500 })
    }
    totalSaved += chunk.length
  }

  console.log('Schedule debug:', {
    sortedShifts: sortedConfigs.map(c => ({ name: c.name, eligible: c.eligible, rotation: parseRotation(c.rules) })),
    memberNames: members.map((m: any) => (m.name || m.email).toLowerCase()),
    sampleDay: allDates[2] ? Object.entries(memberAssignment[allDates[2]]) : 'no data',
  })

  if (totalSaved === 0) {
    return NextResponse.json({
      error: 'No entries generated. Check shift configs and eligible members.',
      debug: {
        shifts: shiftConfigs.map(c => ({ name: c.name, eligible: c.eligible, perDay: c.perDay })),
        members: Object.keys(membersByName),
      }
    }, { status: 500 })
  }

  return NextResponse.json({ success: true, entriesGenerated: totalSaved })
}
