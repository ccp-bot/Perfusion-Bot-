import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

  // ── NORMAL CHAT ────────────────────────────────────────────
  // Search institutional knowledge base for supplementary context
  let institutionalContext = ''
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
    })
    const embedding = embeddingResponse.data[0].embedding

    let documents: any[] = []
    if (groupId) {
      const { data } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.65,
        match_count: 3,
      })
      documents = (data || []).filter((d: any) =>
        d.group_id === groupId || d.institution_id === 'hospital_a'
      )
    } else {
      const { data } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.65,
        match_count: 3,
      })
      documents = data || []
    }

    if (documents.length > 0) {
      institutionalContext = documents.map((d: any) => d.content).join('\n\n')
    }
  } catch { /* institutional search failure shouldn't block chat */ }

  const conversationHistory = messages.map((m: any) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))

  const institutionalSection = institutionalContext
    ? `\n\nINSTITUTIONAL KNOWLEDGE (from your institution's saved protocols, policies, and case notes — use this to supplement your answers when relevant, and note when information comes from institutional records):
${institutionalContext}`
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

When answering:
- Lead with the answer, not the context
- Use your full perfusion knowledge first — you ARE the expert
- If the institutional knowledge base has relevant protocols or policies for this institution, incorporate those and note them
- Be direct and clinical. Say what needs to be said, nothing more.
- When guidelines differ between institutions or societies, note it briefly
- Always prioritize patient safety
- If asked about something outside perfusion, you can answer briefly but remind them of your specialty

IMPORTANT — Protocol and Policy Change Detection:
When a user tells you about a change to a protocol, procedure, equipment preference, or institutional policy (e.g., "Dr. Smith switched to 24Fr cannula", "we no longer use heparin-bonded circuits", "new policy: all patients get TEE"), you MUST:
1. Acknowledge the change
2. Summarize it clearly
3. End your response with a special tag on its own line:
   [PROTOCOL_UPDATE: your concise summary of the change here] — if it's a protocol/procedure/equipment change
   [POLICY_UPDATE: your concise summary of the change here] — if it's an institutional policy change

Only use these tags when the user is clearly reporting a real change, NOT when they are asking questions about protocols or policies. The summary inside the tag should be factual and concise (1-2 sentences).${institutionalSection}`,
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
