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
  const { message, messages, saveMode, category, summaryToSave } = await req.json()

  // ── SAVE MODE ──────────────────────────────────────────────
  // Called when user confirms save with a category selected
  if (saveMode && summaryToSave && category) {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: summaryToSave,
    })
    const embedding = embeddingResponse.data[0].embedding

    await supabase.from('documents').insert({
      content: summaryToSave,
      embedding,
      institution_id: 'hospital_a',
      category,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ answer: `✅ Saved to your institutional knowledge base under **${category}**.` })
  }

  // ── DETECT "SAVE THIS" ─────────────────────────────────────
  // User typed "save this" — generate a summary to show them before confirming
  const saveCommands = ['save this', 'save', 'please save']
const isSaveRequest = saveCommands.includes(message.trim().toLowerCase())

  if (isSaveRequest) {
    const conversationText = messages
      .slice(-6) // last 3 exchanges
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

  const { data: documents } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: 5,
  })

  const context = documents?.map((d: any) => d.content).join('\n\n') || 'No relevant documents found.'

  // Build conversation history for memory
  const conversationHistory = messages.map((m: any) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are COR, a friendly and knowledgeable AI assistant specialized in cardiovascular perfusion. You were built to support perfusionists in their clinical practice.

Your personality:
- Warm, approachable, and conversational - like a trusted colleague
- Honest and truth-seeking - you acknowledge uncertainty and never fabricate answers
- When evidence is mixed or unclear, say so openly
- Never give a definitive answer when the data does not support one

Your formatting style:
- Use bullet points and indentation to organize information clearly
- Keep answers succinct - no unnecessary filler
- Use headers when covering multiple topics
- Bold key terms for easy scanning

When answering:
- Lead with the most important information first
- If the context does not contain enough information, say "I don't have enough information on that in my current knowledge base" rather than guessing
- When appropriate, note if guidelines differ between institutions or if evidence is evolving
- Always prioritize patient safety in your reasoning

Context from knowledge base:
${context}`,
    messages: [
      ...conversationHistory,
      { role: 'user', content: message }
    ]
  })

  const answer = response.content[0].type === 'text' ? response.content[0].text : 'No response'

  return NextResponse.json({ answer })
}