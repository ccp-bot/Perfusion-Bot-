import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// POST /api/schedule/generate — auto-generate schedule using Claude
export async function POST(req: NextRequest) {
  const { groupId, userRole, rules, members, shiftTypes, timeOffDates, startDate, weeks } = await req.json()

  if (!groupId || !rules || !members || !shiftTypes) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const numWeeks = weeks || 6
  const start = startDate || new Date().toISOString().split('T')[0]

  // Build list of dates
  const dates: string[] = []
  const d = new Date(start)
  for (let i = 0; i < numWeeks * 7; i++) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }

  const memberNames = members.map((m: any) => m.name || m.email).join(', ')
  const shiftTypeNames = shiftTypes.map((s: any) => s.name).join(', ')
  const timeOffList = (timeOffDates || []).map((t: any) => `${t.name}: ${t.date}`).join('\n') || 'None'

  const prompt = `You are a scheduling assistant for a cardiovascular perfusion team.

TEAM MEMBERS: ${memberNames}

SHIFT TYPES: ${shiftTypeNames}

SCHEDULING RULES (set by the admin — follow these exactly):
${rules}

APPROVED TIME-OFF (these people MUST be off on these dates):
${timeOffList}

DATE RANGE: ${dates[0]} to ${dates[dates.length - 1]} (${numWeeks} weeks)

Generate a complete schedule for every day in the date range. Assign each team member a shift type for each day. Follow the admin's rules precisely. Distribute shifts fairly.

Respond with ONLY a JSON array, no markdown, no code blocks, no explanation. Each entry should be:
{"date": "YYYY-MM-DD", "member": "exact member name", "shift": "exact shift type name"}

Example format:
[{"date":"2026-04-06","member":"John Smith","shift":"On Call"},{"date":"2026-04-06","member":"Sarah Jones","shift":"Off"}]

Generate entries for EVERY member for EVERY day.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let schedule: any[]
    try {
      schedule = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse schedule. Try again.' }, { status: 500 })
    }

    // Map member names back to user IDs and emails
    const memberMap: {[name: string]: {userId: string, email: string}} = {}
    for (const m of members) {
      const name = m.name || m.email
      memberMap[name.toLowerCase()] = { userId: m.userId, email: m.email }
    }

    // Save to database
    let saved = 0
    for (const entry of schedule) {
      const key = (entry.member || '').toLowerCase()
      const m = memberMap[key]
      if (!m) continue

      // Upsert
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
      saved++
    }

    return NextResponse.json({ success: true, entriesGenerated: saved })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 })
  }
}
