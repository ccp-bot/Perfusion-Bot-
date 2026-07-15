import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SUPER_OWNER = 'cliftonmarschel@gmail.com'

// Count distinct real documents (by source_file) for a filter, ignoring folder markers / unnamed rows.
async function distinctFiles(builder: any): Promise<number> {
  const { data } = await builder
  const names = new Set<string>()
  for (const r of (data || [])) {
    const n = (r.source_file || '').trim()
    if (n && n !== '__folder__' && n !== 'Manual Entry') names.add(n)
  }
  return names.size
}
async function countRows(builder: any): Promise<number> {
  const { count } = await builder
  return count || 0
}

// GET /api/control-center?email=&groupId=&userId=
// Returns the live "brain" counts for a hospital (company) and, if userId is given, that person too.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const role = searchParams.get('role')
  const groupId = searchParams.get('groupId')
  const userId = searchParams.get('userId')

  const allowed = (email && email.toLowerCase() === SUPER_OWNER) || role === 'owner' || role === 'admin'
  if (!allowed) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!groupId) return NextResponse.json({ error: 'Missing groupId' }, { status: 400 })

  const d = () => supabase.from('documents')

  const [
    protocols, policies, templates, teamRules, globalRules, globalRef, team, checklistRows,
  ] = await Promise.all([
    distinctFiles(d().select('source_file').eq('category', 'Protocol').eq('group_id', groupId).neq('archived', true)),
    distinctFiles(d().select('source_file').eq('category', 'Policy').eq('group_id', groupId).neq('archived', true)),
    countRows(d().select('id', { count: 'exact', head: true }).eq('category', 'ResponseTemplate').eq('group_id', groupId)),
    countRows(d().select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('folder', 'Team Rules').neq('archived', true)),
    countRows(d().select('id', { count: 'exact', head: true }).eq('institution_id', 'GLOBAL').eq('category', 'Protocol').is('source_file', null).neq('archived', true)),
    distinctFiles(d().select('source_file').eq('institution_id', 'GLOBAL').eq('category', 'Equipment')),
    countRows(supabase.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', groupId)),
    supabase.from('checklist_files').select('file_name').eq('group_id', groupId),
  ])

  const checklists = new Set((checklistRows.data || [])
    .map((r: any) => r.file_name || '')
    .filter((n: string) => n && !n.endsWith('__folder__'))).size

  const company = {
    protocols, policies, templates, checklists, team,
    corrections: teamRules + globalRules,
    teamRules, globalRules,
  }
  const global = { reference: globalRef }

  let individual = null
  if (userId) {
    const [notes, cases] = await Promise.all([
      countRows(d().select('id', { count: 'exact', head: true }).eq('category', 'Notes').eq('user_id', userId)),
      countRows(d().select('id', { count: 'exact', head: true }).eq('category', 'Logbook').eq('user_id', userId).neq('source_file', '__folder__')),
    ])
    individual = { notes, cases }
  }

  return NextResponse.json({ company, global, individual })
}
