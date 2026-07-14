import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// POST /api/diagram — turn a perfusion Q&A (or topic) into a single Mermaid diagram.
// COR chooses: a flowchart for processes/decisions, or a mindmap for concept breakdowns.
export async function POST(req: NextRequest) {
  const { question, answer, topic } = await req.json()
  const source = [question ? `QUESTION:\n${question}` : '', answer ? `COR'S ANSWER:\n${answer}` : '', topic ? `TOPIC:\n${topic}` : '']
    .filter(Boolean).join('\n\n').slice(0, 8000)
  if (!source.trim()) return NextResponse.json({ error: 'Nothing to map' }, { status: 400 })

  const system = `You convert cardiovascular perfusion content into ONE Mermaid diagram.

Choose the diagram type:
- Use "flowchart TD" for processes, procedures, step-by-step sequences, decision trees, algorithms, and emergency responses.
- Use "mindmap" for concept overviews, classifications, or a topic broken into related categories (not a sequence).

STRICT OUTPUT RULES:
- Output ONLY valid Mermaid code. No prose, no backticks, no commentary before or after.
- Keep it focused and legible: 6 to 18 nodes. Summarize — never put a full sentence in a node. Labels <= 6 words.

FLOWCHART RULES (very important, or it will not render):
- First line exactly: flowchart TD
- Wrap EVERY node label in double quotes: A["Heparinize 300 u/kg"] --> B["Confirm ACT > 480"]
- For a decision, use a diamond with quoted text and labeled edges:
  C{"ACT > 480?"} -->|Yes| D["Go on bypass"]
  C -->|No| E["Redose heparin"]
- Never use raw parentheses, colons, or semicolons inside a label unless the whole label is inside double quotes (it must be).
- Node ids are simple letters/numbers (A, B, C1). Never reuse an id for different text.

MINDMAP RULES:
- First line exactly: mindmap
- Second line the root wrapped in double parentheses: root(("Cardioplegia"))
- Then indented child nodes, one per line, plain short text, deeper indentation = deeper branch.
- Do not use quotes or special punctuation in mindmap child nodes.

Return only the diagram code.`

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: source }],
    })
    let code = resp.content[0].type === 'text' ? resp.content[0].text : ''
    // Strip any accidental code fences or leading prose.
    code = code.replace(/```mermaid/gi, '').replace(/```/g, '').trim()
    // If the model added a stray intro line, cut to the first real diagram keyword.
    const start = code.search(/\b(flowchart|graph|mindmap)\b/)
    if (start > 0) code = code.slice(start)
    if (!code) return NextResponse.json({ error: 'Could not build a map' }, { status: 500 })
    const kind = /^\s*mindmap/.test(code) ? 'mindmap' : 'flowchart'
    return NextResponse.json({ code, kind })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Diagram generation failed' }, { status: 500 })
  }
}
