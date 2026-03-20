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
  const { message } = await req.json()

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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an expert AI assistant for cardiovascular perfusionists. Answer the following question using the provided context from perfusion guidelines and standards.

Context:
${context}

Question: ${message}

Provide a clear, accurate answer based on the context. If the context doesn't contain relevant information, say so.`
      }
    ]
  })

  const answer = response.content[0].type === 'text' ? response.content[0].text : 'No response'

  return NextResponse.json({ answer })
}