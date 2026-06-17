import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/workplaces?userId=... — list a user's saved workplaces (synced to their account)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) return NextResponse.json({ workplaces: [] })
  const { data, error } = await supabase
    .from('workplaces')
    .select('id, data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ workplaces: [] })
  const workplaces = (data || []).map(r => ({ id: r.id, ...(r.data || {}) }))
  return NextResponse.json({ workplaces })
}

// POST /api/workplaces — create or update { userId, id?, data }
export async function POST(req: NextRequest) {
  const { userId, id, data } = await req.json()
  if (!userId || !data) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (id) {
    const { error } = await supabase.from('workplaces').update({ data }).eq('id', id).eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, id })
  }
  const { data: row, error } = await supabase.from('workplaces').insert({ user_id: userId, data }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: row.id })
}

// DELETE /api/workplaces — { id, userId }
export async function DELETE(req: NextRequest) {
  const { id, userId } = await req.json()
  if (!id || !userId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const { error } = await supabase.from('workplaces').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
