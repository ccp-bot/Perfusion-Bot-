import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// POST /api/critique — COR reviews its own answer and suggests what a perfusionist
// might flag as wrong, so the user can tap-to-fill a report.
export async function POST(req: NextRequest) {
  const { question, answer } = await req.json()
  if (!answer?.trim()) return NextResponse.json({ suggestions: [] })

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You are a meticulous senior cardiovascular perfusionist double-checking an answer that a perfusion AI gave.
List up to 3 specific things in the AI's answer that are MOST LIKELY to be wrong, outdated, unsafe, or worth double-checking — the kind of thing a perfusionist would flag as an error.
Each item must be a short, plain phrase under 90 characters, written as the correction (e.g. "Three-stage cannula is wrong for an MVR — use bicaval").
Return ONLY a JSON array of strings. No prose, no markdown. If the answer looks fully correct, return [].`,
      messages: [{ role: 'user', content: `Question: ${question || '(not provided)'}\n\nAI answer:\n${answer.slice(0, 4000)}` }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    let suggestions: string[] = []
    try { suggestions = JSON.parse(match ? match[0] : text) } catch { suggestions = [] }
    suggestions = (Array.isArray(suggestions) ? suggestions : []).filter(s => typeof s === 'string' && s.trim()).slice(0, 3)
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
