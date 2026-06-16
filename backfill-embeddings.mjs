// One-time backfill: generate embeddings for any non-archived documents that are
// missing one (e.g. uploaded while the OpenAI key was down). Safe to re-run.
//   Requires a WORKING OPENAI_API_KEY in .env.local. Run with:  node backfill-embeddings.mjs
import fs from 'fs'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync('.env.local', 'utf8')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim() : null }

const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
const openai = new OpenAI({ apiKey: get('OPENAI_API_KEY') })

const { data: rows, error } = await supabase
  .from('documents')
  .select('id, content, category')
  .is('embedding', null)
  .neq('archived', true)

if (error) { console.error('Fetch error:', error.message); process.exit(1) }
console.log(`Found ${rows.length} documents missing an embedding.`)

let fixed = 0, failed = 0
for (const row of rows) {
  const text = (row.content || '').slice(0, 8000)
  if (!text.trim()) { continue }
  try {
    const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
    const embedding = res.data[0].embedding
    const { error: upErr } = await supabase.from('documents').update({ embedding }).eq('id', row.id)
    if (upErr) { console.error(`  update failed for ${row.id}:`, upErr.message); failed++ }
    else { fixed++; process.stdout.write(`\r  re-indexed ${fixed}/${rows.length}...`) }
  } catch (e) {
    console.error(`\n  embedding failed for ${row.id} (${row.category}):`, e.message)
    failed++
    if (e.status === 401) { console.error('\n>>> Your OPENAI_API_KEY is invalid. Fix it in .env.local and re-run.'); process.exit(1) }
  }
}
console.log(`\nDone. Re-indexed ${fixed}, failed ${failed}.`)
