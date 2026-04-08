import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ShiftConfig {
  name: string
  eligible: string[]
  perDay: number
  rules: string
}

interface Member {
  name: string
  userId: string
  email: string
}

function parseRotation(rules: string): 'daily' | 'weekly' {
  const lower = (rules || '').toLowerCase()
  if (lower.includes('every day') || lower.includes('everyday') || lower.includes('rotates every') || lower.includes('per weekday')) {
    return 'daily'
  }
  return 'weekly' // default to weekly
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T12:00:00').getDay()
  return day === 0 || day === 6
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
  const start = new Date((startDate || new Date().toISOString().split('T')[0]) + 'T12:00:00')

  // Build member lookup
  const memberMap: { [name: string]: Member } = {}
  for (const m of members) {
    const name = (m.name || m.email).toLowerCase()
    memberMap[name] = { name: m.name || m.email, userId: m.userId, email: m.email }
  }

  // Build time-off lookup: { "name:date" -> true }
  const timeOffSet = new Set<string>()
  for (const t of (timeOffDates || [])) {
    timeOffSet.add(`${(t.name || '').toLowerCase()}:${t.date}`)
  }

  // Load shift configs from the shiftTypes passed in (they should have eligible, per_day, rules from DB)
  // Also fetch from DB to get full config
  const { data: dbShiftTypes } = await supabase
    .from('schedule_shift_types')
    .select('*')
    .eq('group_id', groupId)
    .order('sort_order', { ascending: true })

  const shiftConfigs: ShiftConfig[] = (dbShiftTypes || []).map((st: any) => ({
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

  // Track assignments: date -> set of assigned user names (to prevent double-booking)
  const dayAssignments: { [date: string]: Set<string> } = {}
  for (const date of allDates) {
    dayAssignments[date] = new Set()
  }

  // Track rotation index per shift (for fair round-robin)
  const shiftRotationIndex: { [shiftName: string]: number } = {}

  // For each shift type, assign members using round-robin rotation
  const scheduleEntries: { date: string; member: string; shift: string }[] = []

  for (const config of shiftConfigs) {
    if (config.eligible.length === 0) continue

    const rotation = parseRotation(config.rules)
    const isWeekdayOnly = config.rules.toLowerCase().includes('weekday')
    let rotIndex = shiftRotationIndex[config.name] || 0

    if (rotation === 'weekly') {
      // Weekly rotation: same person(s) for the entire week (Mon-Sun)
      for (let w = 0; w < numWeeks; w++) {
        const weekDates = allDates.slice(w * 7, (w + 1) * 7)

        // Pick perDay people for this week, rotating through eligible list
        const assigned: string[] = []
        let attempts = 0
        while (assigned.length < config.perDay && attempts < config.eligible.length) {
          const candidate = config.eligible[rotIndex % config.eligible.length]
          rotIndex++
          attempts++

          // Check if candidate has time off for any day this week
          const hasTimeOff = weekDates.some(d => timeOffSet.has(`${candidate}:${d}`))
          if (hasTimeOff) continue

          assigned.push(candidate)
        }

        // Assign these people to every day of the week
        for (const date of weekDates) {
          const weekend = isWeekend(date)
          if (isWeekdayOnly && weekend) continue

          for (const person of assigned) {
            // Don't double-book
            if (dayAssignments[date].has(person)) continue
            dayAssignments[date].add(person)
            scheduleEntries.push({ date, member: person, shift: config.name })
          }
        }
      }
    } else {
      // Daily rotation: different person each day
      for (const date of allDates) {
        const weekend = isWeekend(date)
        if (isWeekdayOnly && weekend) continue

        const assigned: string[] = []
        let attempts = 0
        while (assigned.length < config.perDay && attempts < config.eligible.length) {
          const candidate = config.eligible[rotIndex % config.eligible.length]
          rotIndex++
          attempts++

          // Check time off
          if (timeOffSet.has(`${candidate}:${date}`)) continue

          // Don't double-book on this day
          if (dayAssignments[date].has(candidate)) continue

          assigned.push(candidate)
        }

        for (const person of assigned) {
          dayAssignments[date].add(person)
          scheduleEntries.push({ date, member: person, shift: config.name })
        }
      }
    }

    shiftRotationIndex[config.name] = rotIndex
  }

  // Save to database
  let totalSaved = 0
  for (const entry of scheduleEntries) {
    const m = memberMap[entry.member]
    if (!m) continue

    const { data: existing } = await supabase
      .from('schedules')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', m.userId)
      .eq('date', entry.date)
      .single()

    if (existing) {
      await supabase.from('schedules').update({ shift_type: entry.shift }).eq('id', existing.id)
    } else {
      await supabase.from('schedules').insert({
        group_id: groupId,
        user_id: m.userId,
        user_email: m.email,
        date: entry.date,
        shift_type: entry.shift,
      })
    }
    totalSaved++
  }

  if (totalSaved === 0) {
    return NextResponse.json({ error: 'No entries generated. Check shift configs and eligible members.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, entriesGenerated: totalSaved })
}
