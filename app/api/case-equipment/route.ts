import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_CASE_TYPES = ['AVR', 'MVR', 'CABG', 'Type-A', 'Peds']

// GET /api/case-equipment?groupId=xxx — get all case type equipment mappings
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')

  if (!groupId) return NextResponse.json({ mappings: [], caseTypes: DEFAULT_CASE_TYPES })

  const { data } = await supabase
    .from('case_equipment')
    .select('*')
    .eq('group_id', groupId)

  return NextResponse.json({ mappings: data || [], caseTypes: DEFAULT_CASE_TYPES })
}

// POST /api/case-equipment — set equipment list for a case type
export async function POST(req: NextRequest) {
  const { groupId, caseType, items, userId, userRole } = await req.json()

  if (!groupId || !caseType || !items) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can edit case equipment' }, { status: 403 })
  }

  // items is an array of { itemName: string, quantity: number }
  const { data: existing } = await supabase
    .from('case_equipment')
    .select('id')
    .eq('group_id', groupId)
    .eq('case_type', caseType)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('case_equipment')
      .update({ items, updated_by: userId })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('case_equipment')
      .insert({ group_id: groupId, case_type: caseType, items, updated_by: userId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
