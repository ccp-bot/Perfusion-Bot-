import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { groupId, userRole, rules, members, shiftTypes, timeOffDates, startDate, weeks } = await req.json()

  if (!groupId || !rules || !members || !shiftTypes) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const numWeeks = weeks || 6
  const start = new Date(startDate || new Date().toISOString().split('T')[0])

  const memberNames = members.map((m: any) => m.name || m.email).join(', ')
  const shiftTypeNames = shiftTypes.map((s: any) => s.name).join(', ')
  const timeOffList = (timeOffDates || []).map((t: any) => `${t.name}: ${t.date}`).join('\n') || 'None'

  // Build member map for saving
  const memberMap: {[name: string]: {userId: string, email: string}} = {}
  for (const m of members) {
    const name = (m.name || m.email).toLowerCase()
    memberMap[name] = { userId: m.userId, email: m.email }
  }

  let totalSaved = 0

  // Generate one week at a time to avoid token limits
  for (let w = 0; w < numWeeks; w++) {
    const weekStart = new Date(start)
    weekStart.setDate(weekStart.getDate() + w * 7)
    const dates: string[] = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + d)
      dates.push(day.toISOString().split('T')[0])
    }

    // Label each date as weekday or weekend
    const datesLabeled = dates.map(d => {
      const day = new Date(d).getDay()
      return `${d} (${day === 0 || day === 6 ? 'WEEKEND' : 'WEEKDAY'})`
    }).join(', ')

    const prompt = `You are a scheduling assistant. Generate a 1-week perfusion schedule.

TEAM MEMBERS: ${memberNames}
AVAILABLE SHIFT TYPES: ${shiftTypeNames}
DATES: ${datesLabeled}

RULES:
${rules}

TIME-OFF (these people MUST NOT be scheduled on these dates):
${timeOffList}

CRITICAL INSTRUCTIONS:
- Each person can only be assigned ONE shift per day
- No person should be assigned to two shifts on the same day
- Only assign shifts from the AVAILABLE SHIFT TYPES list above
- Use the EXACT shift type names as listed above
- People not assigned a shift should be given "Off"
- Rotate fairly so the same person isn't always on the same shift
${w > 0 ? '- Continue the rotation fairly from previous weeks, vary who gets which shifts' : ''}

Return ONLY a valid JSON array. No markdown, no explanation, no code blocks.
Format: [{"date":"YYYY-MM-DD","member":"Name","shift":"Shift Type"}]
Include one entry per member per day. Use "Off" for unscheduled members.`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
      // Clean up any markdown or extra text
      let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      // Try to extract JSON array if there's extra text
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (arrayMatch) cleaned = arrayMatch[0]

      let schedule: any[]
      try {
        schedule = JSON.parse(cleaned)
      } catch {
        continue // Skip this week if parse fails, try next
      }

      // Save to database
      for (const entry of schedule) {
        const key = (entry.member || '').toLowerCase()
        const m = memberMap[key]
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
    } catch {
      continue // Skip week on error, try next
    }
  }

  if (totalSaved === 0) {
    return NextResponse.json({ error: 'Failed to generate schedule. Check your rules and try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, entriesGenerated: totalSaved })
}
