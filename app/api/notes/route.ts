import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text.slice(0, 8000) || ' ' })
    return res.data[0].embedding
  } catch { return null }
}

// GET /api/notes?userId=xxx — list a user's notes (title, folder, content)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const { data, error } = await supabase
    .from('documents')
    .select('id, content, source_file, folder, created_at')
    .eq('category', 'Notes')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const notes = (data || []).map(d => ({
    id: d.id,
    title: d.source_file || 'Untitled',
    folder: d.folder || null,
    content: d.content || '',
    createdAt: d.created_at,
  }))
  return NextResponse.json({ notes })
}

// POST /api/notes — create a text note { userId, title, body, folder }
export async function POST(req: NextRequest) {
  const { userId, title, body, folder } = await req.json()
  if (!userId || (!title?.trim() && !body?.trim())) {
    return NextResponse.json({ error: 'A title or some text is required' }, { status: 400 })
  }
  const text = (body || '').toString()
  const embedding = await embed(`${title || ''}\n${text}`)

  const { data, error } = await supabase
    .from('documents')
    .insert({
      content: text,
      embedding,
      category: 'Notes',
      user_id: userId,
      source_file: (title || 'Untitled').toString().slice(0, 200),
      folder: folder ? folder.toString() : null,
      institution_id: 'hospital_a',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}

// PATCH /api/notes — update { id, userId, title?, body?, folder? }
export async function PATCH(req: NextRequest) {
  const { id, userId, title, body, folder } = await req.json()
  if (!id || !userId) return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })

  const update: Record<string, any> = {}
  if (title !== undefined) update.source_file = (title || 'Untitled').toString().slice(0, 200)
  if (folder !== undefined) update.folder = folder ? folder.toString() : null
  if (body !== undefined) {
    update.content = body.toString()
    update.embedding = await embed(`${title || ''}\n${body}`)
  }

  const { error } = await supabase.from('documents').update(update).eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/notes — { id, userId }
export async function DELETE(req: NextRequest) {
  const { id, userId } = await req.json()
  if (!id || !userId) return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })
  const { error } = await supabase.from('documents').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
