import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
// Service-role client for Storage writes (server-side only). Falls back to anon if not configured.
const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : supabase

// Folders are encoded as a path prefix inside file_name ("Pre-Bypass/Cart Checklist.pdf") so no
// schema change is needed. An empty folder is a marker row: file_name = "Path/__folder__", file_path = "".
const FOLDER_MARKER = '__folder__'

// GET /api/checklists?groupId=xxx — list all checklist files (folder is encoded in file_name)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')

  if (!groupId) return NextResponse.json({ files: [] })

  const { data, error } = await supabase
    .from('checklist_files')
    .select('id, file_name, file_path, uploaded_by, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ files: [] })
  return NextResponse.json({ files: data || [] })
}

// POST /api/checklists — upload a checklist file, or create an empty folder ({ action:'createFolder' })
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''

  // JSON body = create-folder action (no file upload).
  if (contentType.includes('application/json')) {
    const { action, folder, groupId, userId, userEmail, userRole } = await req.json()
    if (action !== 'createFolder') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    if (!folder?.trim() || !groupId) return NextResponse.json({ error: 'Missing folder or groupId' }, { status: 400 })
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can create folders' }, { status: 403 })
    }
    const { error } = await supabase.from('checklist_files').insert({
      group_id: groupId, file_name: `${folder.trim()}/${FOLDER_MARKER}`, file_path: '',
      uploaded_by: userEmail || null, user_id: userId || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File
  const groupId = formData.get('groupId') as string
  const userId = formData.get('userId') as string
  const userEmail = formData.get('userEmail') as string
  const userRole = formData.get('userRole') as string
  const folder = ((formData.get('folder') as string) || '').trim()

  if (!file || !groupId) return NextResponse.json({ error: 'Missing file or groupId' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can upload checklists' }, { status: 403 })
  }

  const rawName = file.name
  // Store the logical folder as a prefix in file_name; the frontend strips it for display.
  const storedName = folder ? `${folder}/${rawName}` : rawName
  const safe = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${groupId}/${Date.now()}_${safe}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // Ensure the bucket exists (first upload on a fresh project would otherwise 404), then upload.
  await admin.storage.createBucket('checklists', { public: false }).then(() => {}).catch(() => {})
  const { error: uploadError } = await admin.storage
    .from('checklists')
    .upload(filePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: dbError } = await supabase.from('checklist_files').insert({
    group_id: groupId, file_name: storedName, file_path: filePath,
    uploaded_by: userEmail, user_id: userId,
  })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ success: true, fileName: rawName })
}

// DELETE /api/checklists — delete one file ({ id }) or a whole folder ({ action:'deleteFolder', folder, groupId })
export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { id, action, folder, groupId, userRole } = body

  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can delete checklists' }, { status: 403 })
  }

  if (action === 'deleteFolder') {
    if (!folder || !groupId) return NextResponse.json({ error: 'Missing folder or groupId' }, { status: 400 })
    // Every row whose file_name is inside this folder or a sub-folder (prefix "folder/").
    const { data: rows } = await supabase
      .from('checklist_files')
      .select('id, file_name, file_path')
      .eq('group_id', groupId)
    const targets = (rows || []).filter((r: any) => (r.file_name || '').startsWith(folder + '/'))
    const paths = targets.map((r: any) => r.file_path).filter(Boolean)
    if (paths.length) await admin.storage.from('checklists').remove(paths)
    if (targets.length) {
      const { error } = await supabase.from('checklist_files').delete().in('id', targets.map((r: any) => r.id))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Get file path
  const { data: file } = await supabase
    .from('checklist_files')
    .select('file_path')
    .eq('id', id)
    .single()

  if (file && file.file_path) {
    await admin.storage.from('checklists').remove([file.file_path])
  }

  const { error } = await supabase.from('checklist_files').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
