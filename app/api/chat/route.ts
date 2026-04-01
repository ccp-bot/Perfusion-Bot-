import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { message, messages, saveMode, category, summaryToSave, userId, groupId, userEmail } = await req.json()

  // ── SAVE MODE ──────────────────────────────────────────────
  if (saveMode && summaryToSave && category) {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: summaryToSave,
    })
    const embedding = embeddingResponse.data[0].embedding

    await supabase.from('documents').insert({
      content: summaryToSave,
      embedding,
      institution_id: groupId || 'hospital_a',
      category,
      user_id: userId || null,
      group_id: groupId || null,
      created_at: new Date().toISOString(),
    })

    // Notify group members for Protocol and Policy saves
    if (groupId && (category === 'Protocol' || category === 'Policy')) {
      const origin = req.headers.get('origin') || req.headers.get('host') || ''
      const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`
      try {
        await fetch(`${baseUrl}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId,
            category,
            message: `New ${category} entry added: ${summaryToSave.slice(0, 80)}...`,
            createdByEmail: userEmail,
            createdByUserId: userId,
          })
        })
      } catch { /* notification failure shouldn't block save */ }
    }

    return NextResponse.json({ answer: `Saved to your institutional knowledge base under **${category}**.` })
  }

  // ── DETECT "SAVE THIS" ─────────────────────────────────────
  const saveCommands = ['save this', 'save', 'please save']
  const isSaveRequest = saveCommands.includes(message.trim().toLowerCase())

  if (isSaveRequest) {
    const conversationText = messages
      .slice(-6)
      .map((m: any) => `${m.role === 'user' ? 'User' : 'COR'}: ${m.content}`)
      .join('\n')

    const summaryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are COR, a cardiovascular perfusion assistant. A user wants to save this conversation to the institutional knowledge base.

Summarize the key clinical information from this exchange in 3-5 bullet points. Be concise and factual. This will be stored and retrieved in future searches.

Conversation:
${conversationText}

Return only the summary, no preamble.`
        }
      ]
    })

    const summary = summaryResponse.content[0].type === 'text'
      ? summaryResponse.content[0].text
      : 'Could not generate summary.'

    return NextResponse.json({
      answer: null,
      savePreview: true,
      summary
    })
  }

  // ── NORMAL CHAT ────────────────────────────────────────────
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: message,
  })
  const embedding = embeddingResponse.data[0].embedding

  // Search documents — filter by group if user belongs to one
  let documents: any[] = []
  if (groupId) {
    // Search within group's documents
    const { data } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
    })
    // Filter to group documents + global docs
    documents = (data || []).filter((d: any) =>
      d.group_id === groupId || d.institution_id === 'hospital_a'
    )
  } else {
    const { data } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
    })
    documents = data || []
  }

  const context = documents.map((d: any) => d.content).join('\n\n') || 'No relevant documents found.'

  const conversationHistory = messages.map((m: any) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are COR, a friendly and knowledgeable AI assistant specialized in cardiovascular perfusion. You were built to support perfusionists in their clinical practice.

Your personality:
- Warm, approachable, and conversational - like a trusted Professor who is also a mentor and colleague
- Very detailed oriented and evidence-based - you always back up your answers with data and references when possible
- Very succint answers - you get to the point quickly without unnecessary filler
- Honest and truth-seeking - you acknowledge uncertainty and never fabricate answers
- When evidence is mixed or unclear, say so openly
- Never give a definitive answer when the data does not support one

Your formatting style:
- Use bullet points and indentation to organize information clearly
- No use of emojis or overly casual language - maintain a professional tone while being approachable
- No use of # or other markdown headers in your responses, but do use bold for key terms and concepts
- Keep answers succinct - no unnecessary filler
- Use headers when covering multiple topics
- Bold key terms for easy scanning

When answering:
- Lead with the most important information first
- If the context does not contain enough information, say "I don't have enough information on that in my current knowledge base" rather than guessing
- When appropriate, note if guidelines differ between institutions or if evidence is evolving
- Always prioritize patient safety in your reasoning

IMPORTANT — Protocol and Policy Change Detection:
When a user tells you about a change to a protocol, procedure, equipment preference, or institutional policy (e.g., "Dr. Smith switched to 24Fr cannula", "we no longer use heparin-bonded circuits", "new policy: all patients get TEE"), you MUST:
1. Acknowledge the change
2. Summarize it clearly
3. End your response with a special tag on its own line:
   [PROTOCOL_UPDATE: your concise summary of the change here] — if it's a protocol/procedure/equipment change
   [POLICY_UPDATE: your concise summary of the change here] — if it's an institutional policy change

Only use these tags when the user is clearly reporting a real change, NOT when they are asking questions about protocols or policies. The summary inside the tag should be factual and concise (1-2 sentences).

Context from knowledge base:
${context}`,
    messages: [
      ...conversationHistory,
      { role: 'user', content: message }
    ]
  })

  let answer = response.content[0].type === 'text' ? response.content[0].text : 'No response'

  // Check for protocol/policy update tags and auto-save
  const protocolMatch = answer.match(/\[PROTOCOL_UPDATE:\s*(.+?)\]/)
  const policyMatch = answer.match(/\[POLICY_UPDATE:\s*(.+?)\]/)
  const updateMatch = protocolMatch || policyMatch
  const updateCategory = protocolMatch ? 'Protocol' : policyMatch ? 'Policy' : null

  if (updateMatch && updateCategory && groupId) {
    const updateSummary = updateMatch[1].trim()

    // Save to knowledge base
    const updateEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: updateSummary,
    })

    await supabase.from('documents').insert({
      content: updateSummary,
      embedding: updateEmbedding.data[0].embedding,
      institution_id: groupId,
      category: updateCategory,
      user_id: userId || null,
      group_id: groupId,
      created_at: new Date().toISOString(),
    })

    // Notify group members
    const origin = req.headers.get('origin') || req.headers.get('host') || ''
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`
    try {
      await fetch(`${baseUrl}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          category: updateCategory,
          message: updateSummary,
          createdByEmail: userEmail,
          createdByUserId: userId,
        })
      })
    } catch { /* notification failure shouldn't block response */ }

    // Remove the tag from the visible response
    answer = answer.replace(/\[(?:PROTOCOL|POLICY)_UPDATE:\s*.+?\]/, '').trim()
  }

  return NextResponse.json({ answer })
}
