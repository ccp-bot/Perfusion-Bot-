import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import pkg from 'pdf-parse'
const pdf = pkg

const supabase = createClient(
  'https://sqnosvhrvctucmvrogev.supabase.co',
  'eyJ...'
)

const openai = new OpenAI({ apiKey: 'sk-proj-...' })

async function chunkText(text, chunkSize = 500) {
  const words = text.split(' ')
  const chunks = []
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '))
  }
  return chunks
}

async function uploadPDF(filePath) {
  console.log(`Processing ${filePath}...`)
  const dataBuffer = fs.readFileSync(filePath)
  const pdfData = await pdf(dataBuffer)
  const chunks = await chunkText(pdfData.text)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunk,
    })
    const embedding = response.data[0].embedding
    await supabase.from('documents').insert({
      content: chunk,
      metadata: { source: path.basename(filePath), chunk: i },
      embedding,
    })
    console.log(`Chunk ${i + 1}/${chunks.length} uploaded`)
  }
  console.log(`Done: ${path.basename(filePath)}`)
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
  console.log('Usage: node upload-pdf.mjs <path-to-pdf-or-folder>')
  process.exit(1)
}
processInput(inputPath)
```

Keep your real `eyJ...` and `sk-proj-...` keys in there, save with **Ctrl+S**, then run:
```
node upload-pdf.mjs "C:\Users\clift\Desktop\AMSECT Standards and Guidelines" Sonnet 4.6Claude is AI and can make mistake