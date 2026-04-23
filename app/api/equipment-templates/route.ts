import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/equipment-templates?userId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const { data, error } = await supabase
    .from('equipment_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

// POST /api/equipment-templates — create a template
export async function POST(req: NextRequest) {
  const { userId, userEmail, name, equipment } = await req.json()
  if (!userId || !name) return NextResponse.json({ error: 'Missing userId or name' }, { status: 400 })

  const { data, error } = await supabase
    .from('equipment_templates')
    .insert({
      user_id: userId,
      user_email: userEmail || null,
      name,
      equipment: equipment || {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

// DELETE /api/equipment-templates?id=xxx&userId=yyy
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const userId = searchParams.get('userId')
  if (!id || !userId) return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })

  const { error } = await supabase
    .from('equipment_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
