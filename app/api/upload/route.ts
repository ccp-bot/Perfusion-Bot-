import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { randomUUID } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
// Service-role client for Storage writes (server-side only). Falls back to anon if not configured.
const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : supabase
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// Split text into chunks of roughly maxChars, breaking on paragraph boundaries
function chunkText(text: string, maxChars = 1500): string[] {
  const paragraphs = text.split(/\n\s*\n/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (current.length + trimmed.length > maxChars && current.length > 0) {
      chunks.push(current.trim())
      current = ''
    }
    current += (current ? '\n\n' : '') + trimmed
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

// POST /api/upload — upload a file or manual entry to the knowledge base
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const manualContent = formData.get('content') as string | null
  const category = formData.get('category') as string
  const userId = formData.get('userId') as string
  const userEmail = formData.get('userEmail') as string
  const groupId = formData.get('groupId') as string
  const userRole = formData.get('userRole') as string
  const folder = formData.get('folder') as string

  if (!category || !userId) {
    return NextResponse.json({ error: 'Missing category or userId' }, { status: 400 })
  }

  // Personal categories — any signed-in user can add their own.
  // Other categories (Protocol, Policy, etc.) are shared institutional content — owner/admin only.
  const personalCategories = ['Logbook', 'Case Notes', 'Notes']
  if (!personalCategories.includes(category) && userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can upload content' }, { status: 403 })
  }

  let textContent = ''
  let fileName = 'Manual Entry'
  let fileBuffer: Buffer | null = null
  let fileType = ''
  let fileUrl: string | null = null

  if (file) {
    fileName = file.name
    fileType = file.type || ''
    const buffer = Buffer.from(await file.arrayBuffer())
    fileBuffer = buffer
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      if (ext === 'pdf') {
        // @ts-ignore - pdf-parse types are inconsistent
        const pdfParse = (await import('pdf-parse')) as any
        const parseFn = pdfParse.default || pdfParse
        const pdfData = await parseFn(buffer)
        textContent = pdfData.text
      } else if (ext === 'docx' || ext === 'doc') {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        textContent = result.value
      } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheets: string[] = []
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          sheets.push(`Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`)
        }
        textContent = sheets.join('\n\n')
      } else if (ext === 'txt') {
        textContent = buffer.toString('utf-8')
      } else {
        return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 })
      }
    } catch (err: any) {
      return NextResponse.json({ error: `Failed to parse file: ${err.message}` }, { status: 500 })
    }
  } else if (manualContent) {
    // Form fields normalize newlines to CRLF over the wire — store clean LF.
    textContent = manualContent.replace(/\r\n/g, '\n')
  } else {
    return NextResponse.json({ error: 'No file or content provided' }, { status: 400 })
  }

  if (!textContent.trim()) {
    return NextResponse.json({ error: 'No text content could be extracted' }, { status: 400 })
  }

  // Re-uploading a Protocol/Policy file with the same name = a new version.
  // Archive the previous version: keep it viewable, but remove its embeddings so
  // COR no longer searches it (only the current version drives answers).
  if (file && (category === 'Protocol' || category === 'Policy')) {
    let arch = supabase.from('documents').update({ archived: true, embedding: null })
      .eq('category', category).eq('source_file', fileName).eq('archived', false)
    if (groupId) arch = arch.eq('group_id', groupId)
    await arch
  }

  // Save the ORIGINAL file to storage so it can be viewed later (real PDF/Word/image), not just text.
  if (file && fileBuffer) {
    try {
      await admin.storage.createBucket('originals', { public: true }).then(() => {}).catch(() => {})
      const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${groupId || userId || 'x'}/${randomUUID()}-${safe}`
      const { error: upErr } = await admin.storage.from('originals').upload(path, fileBuffer, { contentType: fileType || 'application/octet-stream', upsert: true })
      if (!upErr) {
        const { data: pub } = admin.storage.from('originals').getPublicUrl(path)
        fileUrl = pub?.publicUrl || null
      }
    } catch { /* storage is optional — the extracted text is still saved */ }
  }

  // Chunk the text
  const chunks = chunkText(textContent)
  let savedCount = 0
  let lastError = ''

  for (const chunk of chunks) {
    // Embedding is only needed for AI search — if it fails, still save the entry.
    let embedding: number[] | null = null
    try {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunk,
      })
      embedding = embeddingRes.data[0].embedding
    } catch (e: any) {
      lastError = `Embedding failed: ${e?.message || 'unknown error'}`
    }

    const { error } = await supabase.from('documents').insert({
      content: chunk,
      embedding,
      institution_id: groupId || 'hospital_a',
      category,
      user_id: userId,
      group_id: groupId || null,
      source_file: fileName,
      folder: folder || null,
      uploaded_by: userEmail || null,
      file_path: fileUrl,
      created_at: new Date().toISOString(),
    })

    if (!error) savedCount++
    else lastError = error.message
  }

  if (savedCount === 0) {
    return NextResponse.json({ error: lastError || 'Could not save entry' }, { status: 500 })
  }

  // Notify group members if Protocol or Policy
  if (groupId && (category === 'Protocol' || category === 'Policy')) {
    const origin = req.headers.get('origin') || req.headers.get('host') || ''
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`
    try {
      await fetch(`${baseUrl}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          category,
          message: `New ${category} uploaded: ${fileName} (${savedCount} sections)`,
          createdByEmail: userEmail,
          createdByUserId: userId,
        })
      })
    } catch { /* ignore */ }
  }

  return NextResponse.json({ success: true, chunks: savedCount, fileName })
}
