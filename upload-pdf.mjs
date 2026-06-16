import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Secrets are read from .env.local — NEVER hardcode keys here (this file is in a public repo).
const env = fs.readFileSync('.env.local', 'utf8')
const getEnv = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : null }

const supabase = createClient(
  getEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
)

const openai = new OpenAI({ apiKey: getEnv('OPENAI_API_KEY') })

async function isAlreadyUploaded(filename) {
  const { data } = await supabase
    .from('documents')
    .select('id')
    .eq('metadata->>source', filename)
    .limit(1)
  return data && data.length > 0
}

async function extractText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdf = await getDocument({ data }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text
}

function chunkText(text, chunkSize = 500) {
  const words = text.split(' ')
  const chunks = []
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '))
  }
  return chunks
}

async function uploadPDF(filePath) {
  const filename = path.basename(filePath)
  const already = await isAlreadyUploaded(filename)
  if (already) {
    console.log(`Skipping ${filename} — already uploaded`)
    return
  }
  console.log(`Processing ${filename}...`)
  const text = await extractText(filePath)
  const chunks = chunkText(text)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunk,
    })
    const embedding = response.data[0].embedding
    await supabase.from('documents').insert({
      content: chunk,
      metadata: { source: filename, chunk: i },
      embedding,
    })
    console.log(`Chunk ${i + 1}/${chunks.length} uploaded`)
  }
  console.log(`Done: ${filename}`)
}

async function processInput(inputPath) {
  const stat = fs.statSync(inputPath)
  if (stat.isDirectory()) {
    const files = fs.readdirSync(inputPath).filter(f => f.endsWith('.pdf'))
    console.log(`Found ${files.length} PDFs`)
    for (const file of files) {
      await uploadPDF(path.join(inputPath, file))
    }
  } else {
    await uploadPDF(inputPath)
  }
  console.log('All done!')
}

const inputPath = process.argv[2]
if (!inputPath) {
  console.log('Usage: node upload-pdf.mjs <path>')
  process.exit(1)
}
processInput(inputPath)