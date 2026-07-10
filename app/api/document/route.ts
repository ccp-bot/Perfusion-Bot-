import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/document?name=<source_file>&groupId=&userId= — reassemble a saved document's full text
// from its chunks, so the user can view the exact file COR cited. Scoped to what they can see.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  const groupId = searchParams.get('groupId')
  const userId = searchParams.get('userId')
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  async function fetchRows(sel: string) {
    return supabase.from('documents').select(sel).eq('source_file', name).order('created_at', { ascending: true })
  }
  // Try to include file_path; fall back if that column hasn't been added yet.
  let { data, error }: any = await fetchRows('content, group_id, institution_id, user_id, category, folder, created_at, archived, file_path')
  if (error) ({ data, error } = await fetchRows('content, group_id, institution_id, user_id, category, folder, created_at, archived'))

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Only include chunks the user is allowed to see (their group, global, legacy, or their own).
  const visible = data.filter((d: any) =>
    !d.archived && (
      d.institution_id === 'GLOBAL' ||
      d.institution_id === 'hospital_a' ||
      (groupId && String(d.group_id) === String(groupId)) ||
      (userId && String(d.user_id) === String(userId))
    )
  )
  if (visible.length === 0) return NextResponse.json({ error: 'Not authorized to view this document' }, { status: 403 })

  const content = visible.map((d: any) => (d.content || '').trim()).filter(Boolean).join('\n\n')
  const fileUrl = visible.map((d: any) => d.file_path).find((u: any) => u) || null
  return NextResponse.json({ name, content, fileUrl, category: visible[0].category, folder: visible[0].folder })
}
