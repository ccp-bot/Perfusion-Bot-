import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Default template fields if none exist yet
const DEFAULT_FIELDS = [
  'MRN',
  'Surgeon',
  'Case Type',
  'Bypass Time',
  'Cross-Clamp Time',
  'Lowest Temp',
  'Complications',
]

// GET /api/templates?groupId=xxx — get the case log template for a group
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')

  if (!groupId) return NextResponse.json({ fields: DEFAULT_FIELDS })

  const { data } = await supabase
    .from('case_templates')
    .select('fields')
    .eq('group_id', groupId)
    .single()

  return NextResponse.json({ fields: data?.fields || DEFAULT_FIELDS })
}

// POST /api/templates — create or update the case log template
export async function POST(req: NextRequest) {
  const { groupId, fields, userId, userRole } = await req.json()

  if (!groupId || !fields) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can edit templates' }, { status: 403 })
  }

  // Upsert — update if exists, insert if not
  const { data: existing } = await supabase
    .from('case_templates')
    .select('id')
    .eq('group_id', groupId)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('case_templates')
      .update({ fields, updated_by: userId })
      .eq('group_id', groupId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('case_templates')
      .insert({ group_id: groupId, fields, updated_by: userId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
