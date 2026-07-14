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

// GET /api/checklists?groupId=xxx — list all checklist files for a group
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

// POST /api/checklists — upload a checklist file
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const groupId = formData.get('groupId') as string
  const userId = formData.get('userId') as string
  const userEmail = formData.get('userEmail') as string
  const userRole = formData.get('userRole') as string

  if (!file || !groupId) return NextResponse.json({ error: 'Missing file or groupId' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can upload checklists' }, { status: 403 })
  }

  const fileName = file.name
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
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

  // Save metadata to DB
  const { error: dbError } = await supabase
    .from('checklist_files')
    .insert({
      group_id: groupId,
      file_name: fileName,
      file_path: filePath,
      uploaded_by: userEmail,
      user_id: userId,
    })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ success: true, fileName })
}

// DELETE /api/checklists — delete a checklist file
export async function DELETE(req: NextRequest) {
  const { id, userRole } = await req.json()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can delete checklists' }, { status: 403 })
  }

  // Get file path
  const { data: file } = await supabase
    .from('checklist_files')
    .select('file_path')
    .eq('id', id)
    .single()

  if (file) {
    await admin.storage.from('checklists').remove([file.file_path])
  }

  const { error } = await supabase.from('checklist_files').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
