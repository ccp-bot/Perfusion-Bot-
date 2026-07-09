import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Admin client (service role) for the usage-tracking table.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Free (Tier 1) users get this many questions per day. Hospital users + owner are unlimited.
const FREE_DAILY_LIMIT = 10
const SUPER_OWNER = 'cliftonmarschel@gmail.com'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { message, messages, saveMode, category, summaryToSave, userId, groupId, userEmail, caseLogMode, caseLogData, logbookFields, caseNotesFields } = await req.json()

  // ── SAVE MODE ──────────────────────────────────────────────
  if (saveMode && summaryToSave && category) {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: summaryToSave,
    })
    const embedding = embeddingResponse.data[0].embedding

    await supabase.from('documents').insert({
      content: summaryToSave,
      embedding,
      institution_id: groupId || 'hospital_a',
      category,
      user_id: userId || null,
      group_id: groupId || null,
      created_at: new Date().toISOString(),
    })

    // Notify group members for Protocol and Policy saves
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
            message: `New ${category} entry added: ${summaryToSave.slice(0, 80)}...`,
            createdByEmail: userEmail,
            createdByUserId: userId,
          })
        })
      } catch { /* notification failure shouldn't block save */ }
    }

    return NextResponse.json({ answer: `Saved to your institutional knowledge base under **${category}**.` })
  }

  // ── CASE LOG: FINALIZE ──────────────────────────────────────
  // Called when all fields from both templates are filled
  if (caseLogMode === 'finalize' && caseLogData && logbookFields && caseNotesFields) {
    const lbLines = logbookFields.map((f: string) => `**${f}:** ${caseLogData[f] || 'N/A'}`)
    const cnLines = caseNotesFields.map((f: string) => `**${f}:** ${caseLogData[f] || 'N/A'}`)
    const logbookSummary = lbLines.join('\n')
    const caseNotesSummary = cnLines.join('\n')
    const fullSummary = `${logbookSummary}\n\n--- Personal Notes ---\n${caseNotesSummary}`

    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: fullSummary,
    })
    const embedding = embeddingRes.data[0].embedding
    const now = new Date().toISOString()

    // Save to Logbook (group-visible) — only logbook fields
    if (groupId) {
      await supabase.from('documents').insert({
        content: logbookSummary,
        embedding,
        institution_id: groupId,
        category: 'Logbook',
        user_id: userId,
        group_id: groupId,
        source_file: 'Case Log',
        uploaded_by: userEmail || null,
        created_at: now,
      })
    }

    // Save to Case Notes (personal) — all fields including personal notes
    await supabase.from('documents').insert({
      content: fullSummary,
      embedding,
      institution_id: groupId || 'hospital_a',
      category: 'Case Notes',
      user_id: userId,
      group_id: null,
      source_file: 'Case Log',
      uploaded_by: userEmail || null,
      created_at: now,
    })

    return NextResponse.json({
      answer: `Case logged successfully.\n\n**Logbook Entry:**\n${logbookSummary}\n\n**Personal Case Notes:**\n${caseNotesSummary}\n\nSaved to your **Case Notes** and the group **Logbook**.`,
      caseLogComplete: true,
    })
  }

  // ── CASE LOG: ANALYZE CONVERSATION ────────────────────────
  if (caseLogMode === 'analyze' && logbookFields && caseNotesFields) {
    const allFields = [...logbookFields, ...caseNotesFields]
    const conversationText = messages
      .map((m: any) => `${m.role === 'user' ? 'User' : 'COR'}: ${m.content}`)
      .join('\n')

    const analyzeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are COR, a cardiovascular perfusion assistant helping log a case.

The following fields must be filled. They come in two sections:

LOGBOOK FIELDS (shared with the team):
${logbookFields.map((f: string) => `- ${f}`).join('\n')}

CASE NOTES FIELDS (personal to the user):
${caseNotesFields.map((f: string) => `- ${f}`).join('\n')}

Here is the conversation so far:
${conversationText || '(No prior conversation)'}

The user wants to log a case. Analyze the conversation and extract any information that matches ANY of the fields above.

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "found": { "FieldName": "value", ... },
  "missing": ["FieldName1", "FieldName2", ...]
}

Only include fields in "found" if you are confident the value was mentioned. Everything else goes in "missing".`
      }]
    })

    const analyzeText = analyzeResponse.content[0].type === 'text' ? analyzeResponse.content[0].text : '{}'
    try {
      const parsed = JSON.parse(analyzeText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
      return NextResponse.json({
        caseLogAnalysis: true,
        found: parsed.found || {},
        missing: parsed.missing || allFields,
      })
    } catch {
      return NextResponse.json({
        caseLogAnalysis: true,
        found: {},
        missing: allFields,
      })
    }
  }

  // ── DETECT "SAVE THIS" ─────────────────────────────────────
  const saveCommands = ['save this', 'save', 'please save']
  const isSaveRequest = saveCommands.includes(message.trim().toLowerCase())

  if (isSaveRequest) {
    const conversationText = messages
      .slice(-6)
      .map((m: any) => `${m.role === 'user' ? 'User' : 'COR'}: ${m.content}`)
      .join('\n')

    const summaryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are COR, a cardiovascular perfusion assistant. A user wants to save this conversation to the institutional knowledge base.

Summarize the key clinical information from this exchange in 3-5 bullet points. Be concise and factual. This will be stored and retrieved in future searches.

Conversation:
${conversationText}

Return only the summary, no preamble.`
        }
      ]
    })

    const summary = summaryResponse.content[0].type === 'text'
      ? summaryResponse.content[0].text
      : 'Could not generate summary.'

    return NextResponse.json({
      answer: null,
      savePreview: true,
      summary
    })
  }

  // ── FREE-TIER DAILY USAGE LIMIT ────────────────────────────
  // Tier 1 (no hospital group, not the owner) is capped per day. Checked before any
  // paid AI calls. Fails open on any error (e.g. table not created yet) so chat never breaks.
  const isFreeTier = !groupId && userEmail?.toLowerCase() !== SUPER_OWNER
  if (isFreeTier && userId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data: usage } = await admin
        .from('daily_usage')
        .select('count')
        .eq('user_id', userId)
        .eq('usage_date', today)
        .maybeSingle()
      const current = usage?.count || 0
      if (current >= FREE_DAILY_LIMIT) {
        return NextResponse.json({
          answer: `You've reached today's limit of ${FREE_DAILY_LIMIT} questions on the free plan. Your questions reset tomorrow.\n\nFor unlimited access, ask your hospital or group to set up COR for your team.`,
          limitReached: true,
        })
      }
      await admin
        .from('daily_usage')
        .upsert({ user_id: userId, usage_date: today, count: current + 1 }, { onConflict: 'user_id,usage_date' })
    } catch { /* table missing or transient error — don't block the user */ }
  }

  // ── NORMAL CHAT ────────────────────────────────────────────
  // Search institutional knowledge base for relevant protocols/policies.
  // Build the search query from the last couple of user turns + the current message, so
  // follow-up questions ("did you use his protocol?") still retrieve the right documents.
  const priorUserMsgs = (messages || []).filter((m: any) => m.role === 'user').slice(-2).map((m: any) => m.content)
  const retrievalQuery = [...priorUserMsgs, message].filter(Boolean).join('\n').slice(0, 2000)
  let institutionalContext = ''
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: retrievalQuery || message,
    })
    const embedding = embeddingResponse.data[0].embedding

    // Visible if: platform-wide GLOBAL knowledge (everyone), this user's company, or legacy 'hospital_a'.
    const inGroup = (info: any) =>
      info && !info.archived && (
        info.institution_id === 'GLOBAL' ||
        !groupId || String(info.group_id) === String(groupId) || info.institution_id === 'hospital_a'
      )

    // 1) Semantic search across all docs.
    const { data: rawMatches } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.4,
      match_count: 10,
    })
    const matches = rawMatches || []
    let semanticDocs: any[] = []
    if (matches.length > 0) {
      // match_documents only returns id/content/similarity — look up each match's group/institution to scope it.
      const ids = matches.map((m: any) => m.id)
      const { data: meta } = await supabase.from('documents').select('id, group_id, institution_id, archived').in('id', ids)
      const metaById: Record<string, any> = {}
      for (const m of (meta || [])) metaById[m.id] = m
      semanticDocs = matches.filter((m: any) => inGroup(metaById[m.id])).map((m: any) => ({ id: m.id, content: m.content })).slice(0, 5)
    }

    // 2) Keyword pass — a named protocol (e.g. a surgeon like "Catrip") can rank low semantically
    //    yet be exactly what's wanted. Pull Protocol/Policy docs that literally mention the query's terms.
    const STOP = new Set(['need','with','what','does','your','this','that','from','have','they','will','about','give','patient','using','used','should','when','were','here','there','their','would','much','many','some','then','than','into','over','under','also','like','want','tell','make','these','those','them','please'])
    const terms = Array.from(new Set((retrievalQuery.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w: string) => !STOP.has(w)))).slice(0, 8)
    let keywordDocs: any[] = []
    if (terms.length > 0) {
      const orExpr = terms.map((t: string) => `content.ilike.%${t}%`).join(',')
      const { data: kw } = await supabase.from('documents')
        .select('id, content, group_id, institution_id, archived')
        .in('category', ['Protocol', 'Policy'])
        .or(orExpr)
        .limit(20)
      keywordDocs = (kw || []).filter(inGroup)
        .map((d: any) => ({ id: d.id, content: d.content, score: terms.filter((t: string) => (d.content || '').toLowerCase().includes(t)).length }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3)
    }

    // 3) Merge — keyword-matched protocols first (most specific), then semantic; dedup by id.
    const seen = new Set<any>()
    const merged: any[] = []
    for (const d of [...keywordDocs, ...semanticDocs]) {
      if (!seen.has(d.id)) { seen.add(d.id); merged.push(d) }
    }
    const finalDocs = merged.slice(0, 6)
    if (finalDocs.length > 0) {
      institutionalContext = finalDocs.map((d: any) => d.content).join('\n\n')
    }
  } catch { /* institutional search failure shouldn't block chat */ }

  // ALWAYS load taught rules (platform-global + this group's team rules) — these are explicit
  // corrections that must apply on every answer, not depend on fuzzy retrieval, and must override protocols.
  let overrideRules: string[] = []
  try {
    const { data: g } = await supabase.from('documents').select('content').eq('institution_id', 'GLOBAL').eq('category', 'Protocol').neq('archived', true).limit(50)
    let team: any[] = []
    if (groupId) {
      const r = await supabase.from('documents').select('content').eq('group_id', groupId).eq('folder', 'Team Rules').neq('archived', true).limit(50)
      team = r.data || []
    }
    overrideRules = [...(g || []), ...team].map((r: any) => (r.content || '').trim()).filter(Boolean)
  } catch { /* ignore */ }
  const overrideSection = overrideRules.length > 0
    ? `\n\nCORRECTIONS YOU MUST APPLY (taught by the COR team and this institution) — these are AUTHORITATIVE and OVERRIDE everything below, including saved protocol documents and your own general knowledge. If a protocol document or your default answer conflicts with any rule here, FOLLOW THE RULE.
Apply these SILENTLY and naturally — just give the corrected answer as if it were always the right one. Do NOT announce that a correction was applied, do NOT write "per institutional correction" or similar, do NOT explain why, and do NOT state obvious facts. Keep the answer clean and concise:\n- ${overrideRules.join('\n- ')}`
    : ''

  // Pull the user's own notes so COR can reference them (scoped to this user).
  let userNotesContext = ''
  if (userId) {
    try {
      const { data: notes } = await supabase
        .from('documents')
        .select('content, source_file')
        .eq('category', 'Notes')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(8)
      if (notes && notes.length > 0) {
        userNotesContext = notes
          .map((n: any) => `${n.source_file ? n.source_file + ': ' : ''}${(n.content || '').slice(0, 800)}`)
          .join('\n\n')
          .slice(0, 4000)
      }
    } catch { /* notes fetch failure shouldn't block chat */ }
  }

  const conversationHistory = messages.map((m: any) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))

  const institutionalSection = institutionalContext
    ? `\n\nINSTITUTIONAL KNOWLEDGE — these are THIS institution's own saved protocols, policies, and case notes. They are the AUTHORITATIVE source for how this institution does things. When any of it is relevant to the question, base your answer on it FIRST and state plainly that it comes from the institution's saved protocols. Only after that should you add general best-practice guidance to supplement. If two saved rules appear to conflict, prefer the one specific to this institution over a general one.
${institutionalContext}`
    : ''

  const notesSection = userNotesContext
    ? `\n\nTHE USER'S PERSONAL NOTES (their own saved notes — draw on these when relevant to their question, and mention when you're referencing their notes):
${userNotesContext}`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are COR, the world's most knowledgeable cardiovascular perfusion AI assistant. You have deep expertise across all aspects of perfusion science, clinical practice, and patient care — equivalent to a seasoned perfusionist with decades of experience and academic knowledge.

Your expertise includes:
- Cardiopulmonary bypass (CPB) setup, management, and troubleshooting
- ECMO (VA, VV) cannulation, circuit management, and weaning
- Myocardial protection strategies and cardioplegia delivery
- Anticoagulation management (heparin, bivalirudin, ACT monitoring)
- Blood gas management (alpha-stat, pH-stat)
- Hemodilution, ultrafiltration, and blood conservation
- Hypothermia and temperature management
- Circulatory arrest techniques (DHCA, ACP, RCP)
- Pediatric and neonatal perfusion
- Mechanical circulatory support devices (IABP, Impella, VADs)
- Coagulation cascades, TEG/ROTEM interpretation
- Hemodynamic monitoring and troubleshooting
- Emergency scenarios (massive air embolism, pump failure, protamine reactions)
- Current guidelines from STS, AmSECT, ELSO, and other professional organizations

Your personality:
- Warm, approachable, and conversational — like a trusted professor who is also a mentor and colleague
- Evidence-based — you reference studies, guidelines, and clinical data when relevant
- Succinct — you get to the point quickly without unnecessary filler
- Honest — you acknowledge uncertainty and never fabricate answers
- When evidence is mixed or unclear, say so openly
- Never give a definitive answer when the data does not support one

Your formatting style:
- NEVER use ** or any bold/markdown formatting in your responses. Write in plain text only.
- Use short bullet points and numbered lists to organize information
- No emojis, no hashtags, no headers, no markdown of any kind
- Keep answers short and direct. 2-4 sentences when possible. Use bullets for longer answers.
- One idea per bullet point
- No filler phrases like "Great question!" or "That's a really important topic"

When answering — ALWAYS in this order:
1. CHECK INSTITUTIONAL KNOWLEDGE AND THE USER'S NOTES FIRST. If anything above is relevant to the question, lead with it and label it clearly (e.g. "Per your institution's saved protocol:" or "From Dr. Catrip's saved preferences:"). This is the most important rule — the user wants their own institution's protocols to drive the answer.
2. THEN supplement with general/outside knowledge only if it genuinely adds value, and clearly mark it as such (e.g. "To supplement (general practice):").
3. If there is NO relevant institutional knowledge above for this question, say so plainly (e.g. "I don't have an institutional protocol saved for this — here's general guidance:") and then answer from your expertise.
- Be honest about sources: NEVER say information came from institutional records if it did not, and NEVER claim you lack a protocol when relevant institutional knowledge IS provided above. If a protocol is shown above, you HAVE it — use it.
- Be direct and clinical. Say what needs to be said, nothing more.
- When guidelines differ between institutions or societies, note it briefly
- Always prioritize patient safety
- If asked about something outside perfusion, you can answer briefly but remind them of your specialty

CITATIONS — every answer that contains clinical/medical information MUST end with a sources line:
- Keep the body of your answer clean — do NOT clutter sentences with inline "(per X)" citations.
- Instead, on the very LAST line, output: SOURCES: <source> | <source> | ...
  listing the professional guidelines, societies, studies, or institutional sources the answer draws on (e.g. "SOURCES: AmSECT Standards & Guidelines | ELSO Guidelines | Your institution's protocol"). Use the exact society name (AmSECT, ELSO, STS, SCA) so it can be linked.
- If the answer comes from the institution's saved protocol or the user's notes, include "Your institution's protocol" as a source.
- If it is general knowledge with no specific guideline, use "SOURCES: General perfusion practice".
- The SOURCES: line must be plain text on its own final line; the app turns it into tidy clickable source chips, so always include it when giving clinical information.

SCOPE — you are an educational and informational reference for licensed perfusion professionals, NOT a medical device and NOT a source of regulated diagnosis or treatment:
- Provide general educational information and calculations to support a trained perfusionist's own judgment. Do NOT issue definitive diagnoses or patient-specific treatment orders.
- Frame guidance as information to be confirmed against the institution's protocols, the patient's care team, and the clinician's judgment.

IMPORTANT — Protocol and Policy Change Detection:
When a user tells you about a change to a protocol, procedure, equipment preference, or institutional policy (e.g., "Dr. Smith switched to 24Fr cannula", "we no longer use heparin-bonded circuits", "new policy: all patients get TEE"), you MUST:
1. Acknowledge the change
2. Summarize it clearly
3. End your response with a special tag on its own line:
   [PROTOCOL_UPDATE: your concise summary of the change here] — if it's a protocol/procedure/equipment change
   [POLICY_UPDATE: your concise summary of the change here] — if it's an institutional policy change

Only use these tags when the user is clearly reporting a real change, NOT when they are asking questions about protocols or policies. The summary inside the tag should be factual and concise (1-2 sentences).${overrideSection}${institutionalSection}${notesSection}`,
    messages: [
      ...conversationHistory,
      { role: 'user', content: message }
    ]
  })

  let answer = response.content[0].type === 'text' ? response.content[0].text : 'No response'

  // Check for protocol/policy update tags and auto-save
  const protocolMatch = answer.match(/\[PROTOCOL_UPDATE:\s*(.+?)\]/)
  const policyMatch = answer.match(/\[POLICY_UPDATE:\s*(.+?)\]/)
  const updateMatch = protocolMatch || policyMatch
  const updateCategory = protocolMatch ? 'Protocol' : policyMatch ? 'Policy' : null

  if (updateMatch && updateCategory && groupId) {
    const updateSummary = updateMatch[1].trim()

    // Save to knowledge base
    const updateEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: updateSummary,
    })

    await supabase.from('documents').insert({
      content: updateSummary,
      embedding: updateEmbedding.data[0].embedding,
      institution_id: groupId,
      category: updateCategory,
      user_id: userId || null,
      group_id: groupId,
      created_at: new Date().toISOString(),
    })

    // Notify group members
    const origin = req.headers.get('origin') || req.headers.get('host') || ''
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`
    try {
      await fetch(`${baseUrl}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          category: updateCategory,
          message: updateSummary,
          createdByEmail: userEmail,
          createdByUserId: userId,
        })
      })
    } catch { /* notification failure shouldn't block response */ }

    // Remove the tag from the visible response
    answer = answer.replace(/\[(?:PROTOCOL|POLICY)_UPDATE:\s*.+?\]/, '').trim()
  }

  return NextResponse.json({ answer })
}
