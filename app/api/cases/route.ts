import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/cases?userId=xxx — list all cases for a user
// GET /api/cases?userId=xxx&id=yyy — get a single case
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const id = searchParams.get('id')

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  if (id) {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ case: data })
  }

  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .eq('user_id', userId)
    .order('case_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cases: data || [] })
}

// POST /api/cases — create a new case
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { userId, userEmail, groupId, ...rest } = body

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const payload: Record<string, unknown> = {
    user_id: userId,
    user_email: userEmail || null,
    group_id: groupId || null,
    ...rest,
  }

  const { data, error } = await supabase
    .from('cases')
    .insert(payload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ case: data })
}

// PATCH /api/cases — update a case
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  // Strip client-only fields that aren't columns on `cases` so Supabase
  // doesn't reject with "column not found" (userEmail / groupId are only
  // used on create; the DB columns are user_email / group_id).
  const { id, userId, userEmail: _userEmail, groupId: _groupId, ...updates } = body
  void _userEmail; void _groupId

  if (!id || !userId) return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })

  const { data, error } = await supabase
    .from('cases')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ case: data })
}

// DELETE /api/cases?id=xxx&userId=yyy
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const userId = searchParams.get('userId')

  if (!id || !userId) return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })

  const { error } = await supabase
    .from('cases')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
