import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (!userId) return NextResponse.json({ conversations: [] })

  // Delete expired unpinned conversations
  await supabase
    .from('conversations')
    .delete()
    .eq('user_id', userId)
    .eq('pinned', false)
    .lt('expires_at', new Date().toISOString())

  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, messages, pinned, created_at, expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ conversations: [] })
  return NextResponse.json({ conversations: data || [] })
}

export async function POST(req: NextRequest) {
  const { userId, title, messages, id } = await req.json()

  if (!userId || !messages) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // If an id is passed, this is the same chat session — update it in place (one chat = one entry).
  if (id) {
    const { data, error } = await supabase
      .from('conversations')
      .update({ title: title || 'Conversation', messages })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    if (!error && data) return NextResponse.json({ conversation: data })
    // If the row vanished (e.g. expired/deleted), fall through and insert a fresh one.
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title: title || 'Conversation',
      messages: messages,
      pinned: false,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conversation: data })
}

export async function PATCH(req: NextRequest) {
  const { id, pinned } = await req.json()

  const updateData: any = { pinned }
  if (pinned) {
    updateData.expires_at = null
  } else {
    updateData.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }

  const { error } = await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
