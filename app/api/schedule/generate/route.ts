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

  // Separate weekly and daily shift configs
  const weeklyConfigs = shiftConfigs.filter(c => parseRotation(c.rules) === 'weekly' && c.eligible.length > 0)
  const dailyConfigs = shiftConfigs.filter(c => parseRotation(c.rules) === 'daily' && c.eligible.length > 0)

  // Step 1: Assign weekly shifts first (round-robin per week)
  for (const config of weeklyConfigs) {
    let rotIndex = 0
    for (let w = 0; w < numWeeks; w++) {
      const weekDates = allDates.slice(w * 7, (w + 1) * 7)
      const isWeekdayOnly = config.rules.toLowerCase().includes('weekday')

      const assigned: string[] = []
      for (let i = 0; i < config.eligible.length && assigned.length < config.perDay; i++) {
        const candidate = config.eligible[(rotIndex + i) % config.eligible.length]
        if (weekDates.some(d => timeOffSet.has(`${candidate}:${d}`))) continue
        if (weekDates.some(d => dayAssigned[d]?.has(candidate))) continue
        assigned.push(candidate)
      }
      rotIndex = (rotIndex + 1) % config.eligible.length

      for (const date of weekDates) {
        if (isWeekdayOnly && isWeekend(date)) continue
        for (const person of assigned) {
          dayAssigned[date].add(person)
          memberAssignment[date][person] = config.name
        }
      }
    }
  }

  // Step 2: Assign daily shifts — all daily shifts for each day at once
  // Build a pool of all members eligible for any daily shift
  let dailyRotIndex = 0
  // Collect all unique daily-eligible members (union of all daily shift eligible lists)
  const allDailyEligible = [...new Set(dailyConfigs.flatMap(c => c.eligible))]

  for (const date of allDates) {
    // Check if any daily config is weekday-only (if so, skip weekends)
    const isWeekday = !isWeekend(date)
    if (!isWeekday) continue // daily shifts are weekday-only

    // Get available members (not already on weekly shifts, not on time-off)
    const available: string[] = []
    for (let i = 0; i < allDailyEligible.length; i++) {
      const candidate = allDailyEligible[(dailyRotIndex + i) % allDailyEligible.length]
      if (timeOffSet.has(`${candidate}:${date}`)) continue
      if (dayAssigned[date].has(candidate)) continue
      available.push(candidate)
    }

    // Assign available members to daily shifts in order
    let availIdx = 0
    for (const config of dailyConfigs) {
      for (let p = 0; p < config.perDay; p++) {
        if (availIdx >= available.length) break
        const person = available[availIdx]
        dayAssigned[date].add(person)
        memberAssignment[date][person] = config.name
        availIdx++
      }
    }

    dailyRotIndex = (dailyRotIndex + 1) % allDailyEligible.length
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
    weeklyShifts: weeklyConfigs.map(c => ({ name: c.name, eligible: c.eligible })),
    dailyShifts: dailyConfigs.map(c => ({ name: c.name, eligible: c.eligible })),
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
