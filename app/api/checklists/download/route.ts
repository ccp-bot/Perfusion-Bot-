import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
// Service-role client so signed URLs work even on a private bucket. Falls back to anon.
const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : supabase

// GET /api/checklists/download?id=xxx — get a signed download URL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: file } = await supabase
    .from('checklist_files')
    .select('file_path, file_name')
    .eq('id', id)
    .single()

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const { data: signedUrl, error } = await admin.storage
    .from('checklists')
    .createSignedUrl(file.file_path, 300) // 5 minute expiry

  if (error || !signedUrl) return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })

  return NextResponse.redirect(signedUrl.signedUrl)
}
