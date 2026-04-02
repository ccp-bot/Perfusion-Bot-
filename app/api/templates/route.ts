import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_LOGBOOK_FIELDS = [
  'MRN',
  'Surgeon',
  'Case Type',
  'Bypass Time',
  'Cross-Clamp Time',
  'Lowest Temp',
  'Complications',
]

const DEFAULT_CASENOTES_FIELDS = [
  'Personal Observations',
  'What Went Well',
  'What To Improve',
  'Notes For Next Time',
]

// GET /api/templates?groupId=xxx — get both templates for a group
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')

  if (!groupId) {
    return NextResponse.json({
      logbookFields: DEFAULT_LOGBOOK_FIELDS,
      caseNotesFields: DEFAULT_CASENOTES_FIELDS,
    })
  }

  const { data } = await supabase
    .from('case_templates')
    .select('template_type, fields')
    .eq('group_id', groupId)

  const templates = data || []
  const logbook = templates.find(t => t.template_type === 'logbook')
  const caseNotes = templates.find(t => t.template_type === 'case_notes')

  return NextResponse.json({
    logbookFields: logbook?.fields || DEFAULT_LOGBOOK_FIELDS,
    caseNotesFields: caseNotes?.fields || DEFAULT_CASENOTES_FIELDS,
  })
}

// POST /api/templates — create or update a template
export async function POST(req: NextRequest) {
  const { groupId, fields, templateType, userId, userRole } = await req.json()

  if (!groupId || !fields || !templateType) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can edit templates' }, { status: 403 })
  }

  const { data: existing } = await supabase
    .from('case_templates')
    .select('id')
    .eq('group_id', groupId)
    .eq('template_type', templateType)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('case_templates')
      .update({ fields, updated_by: userId })
      .eq('group_id', groupId)
      .eq('template_type', templateType)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('case_templates')
      .insert({ group_id: groupId, template_type: templateType, fields, updated_by: userId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
