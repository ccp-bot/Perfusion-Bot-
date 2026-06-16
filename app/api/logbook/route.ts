import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/logbook?userId=xxx&category=yyy&groupId=zzz
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const category = searchParams.get('category')
  const groupId = searchParams.get('groupId')

  if (!userId) return NextResponse.json({ error: 'No user ID' }, { status: 400 })

  let query = supabase
    .from('documents')
    .select('id, content, category, created_at, user_id, group_id, source_file, folder, archived, uploaded_by')
    .order('created_at', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  if (groupId) {
    // Show group-shared entries + user's own entries
    query = query.or(`group_id.eq.${groupId},user_id.eq.${userId}`)
  } else {
    // No group — show only user's own entries
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: data || [] })
}

// PATCH /api/logbook — append a timestamped note to an entry
export async function PATCH(req: NextRequest) {
  const { id, note, userId } = await req.json()

  if (!id || !note) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Get existing content
  const { data: entry } = await supabase
    .from('documents')
    .select('content, user_id')
    .eq('id', id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Only the owner of the case note can add notes
  if (entry.user_id !== userId) {
    return NextResponse.json({ error: 'You can only add notes to your own entries' }, { status: 403 })
  }

  const timestamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const appendedContent = `${entry.content}\n\n[${timestamp}] ${note}`

  const { error } = await supabase
    .from('documents')
    .update({ content: appendedContent })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, content: appendedContent })
}

// DELETE /api/logbook
export async function DELETE(req: NextRequest) {
  const { id, userId, userRole, sourceFile, category, groupId } = await req.json()

  // Bulk delete a whole protocol/policy file (all chunks + versions) — owner/admin only.
  if (sourceFile && category) {
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can delete shared content' }, { status: 403 })
    }
    let del = supabase.from('documents').delete().eq('category', category).eq('source_file', sourceFile)
    if (groupId) del = del.eq('group_id', groupId)
    const { error } = await del
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

  // Ownership check — anyone who isn't an owner/admin can only delete their own entries.
  if (userRole !== 'owner' && userRole !== 'admin') {
    const { data: entry } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', id)
      .single()

    if (entry && entry.user_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own entries' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('documents').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
