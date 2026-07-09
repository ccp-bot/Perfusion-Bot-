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

  const { data, error } = await supabase
    .from('documents')
    .select('content, group_id, institution_id, user_id, category, folder, created_at, archived')
    .eq('source_file', name)
    .order('created_at', { ascending: true })

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
  return NextResponse.json({ name, content, category: visible[0].category, folder: visible[0].folder })
}
