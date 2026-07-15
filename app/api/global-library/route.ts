import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SUPER_OWNER = 'cliftonmarschel@gmail.com'
// Platform-wide reference documents (IFUs, standards) live in `documents` as institution_id='GLOBAL',
// category='Equipment', with a real source_file. Empty folders are marker rows (source_file='__folder__').
const CAT = 'Equipment'
const FOLDER_MARKER = '__folder__'

function isOwner(email: string | null) {
  return !!email && email.toLowerCase() === SUPER_OWNER
}

// GET /api/global-library?email= — list global reference docs (grouped by file) + folder markers
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (!isOwner(searchParams.get('email'))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { data, error } = await supabase
    .from('documents')
    .select('id, source_file, folder, file_path, uploaded_by, created_at')
    .eq('institution_id', 'GLOBAL')
    .eq('category', CAT)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ docs: [] })

  // Collapse chunks into one entry per document; keep folder markers so empty folders show.
  const byFile = new Map<string, any>()
  const markers: any[] = []
  for (const r of (data || [])) {
    if (r.source_file === FOLDER_MARKER) { markers.push({ folder: r.folder, isFolder: true }); continue }
    const key = `${r.folder || ''}//${r.source_file}`
    const cur = byFile.get(key)
    if (cur) { cur.chunks++ }
    else byFile.set(key, { source_file: r.source_file, folder: r.folder || '', file_path: r.file_path, uploaded_by: r.uploaded_by, created_at: r.created_at, chunks: 1 })
  }
  return NextResponse.json({ docs: [...byFile.values(), ...markers] })
}

// POST /api/global-library — { action:'createFolder', folder, email }
export async function POST(req: NextRequest) {
  const { action, folder, email } = await req.json()
  if (!isOwner(email)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (action !== 'createFolder') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (!folder?.trim()) return NextResponse.json({ error: 'Missing folder' }, { status: 400 })

  const { error } = await supabase.from('documents').insert({
    content: '', embedding: null, institution_id: 'GLOBAL', category: CAT,
    user_id: null, group_id: null, source_file: FOLDER_MARKER, folder: folder.trim(),
    uploaded_by: email, created_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/global-library — { email, sourceFile } (one doc) or { email, folder } (folder + contents)
export async function DELETE(req: NextRequest) {
  const { email, sourceFile, folder } = await req.json()
  if (!isOwner(email)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const base = () => supabase.from('documents').delete().eq('institution_id', 'GLOBAL').eq('category', CAT)

  if (folder) {
    // Delete the folder marker + everything filed in it or a sub-folder.
    const { data: rows } = await supabase.from('documents').select('id, folder')
      .eq('institution_id', 'GLOBAL').eq('category', CAT)
    const ids = (rows || []).filter((r: any) => (r.folder || '') === folder || (r.folder || '').startsWith(folder + '/')).map((r: any) => r.id)
    if (ids.length) {
      const { error } = await supabase.from('documents').delete().in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (sourceFile) {
    const { error } = await base().eq('source_file', sourceFile)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Missing sourceFile or folder' }, { status: 400 })
}
