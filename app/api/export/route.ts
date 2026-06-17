import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/export?userId=xxx&category=yyy&groupId=zzz
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const category = searchParams.get('category')
  const groupId = searchParams.get('groupId')
  // Optional ordered field list (so every column shows even when a case left it blank).
  const fieldsParam = searchParams.get('fields')
  const orderedFields = fieldsParam ? fieldsParam.split('||').filter(Boolean) : null

  if (!userId || !category) {
    return NextResponse.json({ error: 'Missing userId or category' }, { status: 400 })
  }

  // Fetch entries
  let query = supabase
    .from('documents')
    .select('content, created_at, uploaded_by')
    .eq('category', category)
    .order('created_at', { ascending: false })

  if (category === 'Case Notes') {
    // Personal — only user's own
    query = query.eq('user_id', userId)
  } else if (groupId) {
    // Group entries
    query = query.or(`group_id.eq.${groupId},user_id.eq.${userId}`)
  } else {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'No entries to export' }, { status: 404 })

  // Parse structured content into rows
  const rows: Record<string, string>[] = []
  for (const entry of data) {
    if (!(entry.content || '').trim()) continue // skip empty-folder placeholders
    const parsed: Record<string, string> = {}
    const lines = (entry.content || '').replace(/\r/g, '').split('\n')
    for (const line of lines) {
      // Match patterns like "Field: value" or "**Field:** value"
      const match = line.match(/^\*?\*?([^:*]+?):?\*?\*?\s*[:]\s*(.+)$/i) ||
                    line.match(/^\*?\*?([^:*]+)\*?\*?:\s*(.+)$/i)
      if (match) {
        const key = match[1].replace(/\*/g, '').trim()
        const val = match[2].replace(/\*/g, '').trim()
        if (key && val) parsed[key] = val
      }
    }

    const row: Record<string, string> = {}
    if (orderedFields && orderedFields.length > 0) {
      // Every chosen field gets a column, blank if this case didn't fill it.
      for (const f of orderedFields) row[f] = parsed[f] || ''
      // Keep any extra fields the case had that aren't in the standard list.
      for (const k of Object.keys(parsed)) if (!(k in row)) row[k] = parsed[k]
    } else {
      Object.assign(row, parsed)
    }
    if (Object.keys(parsed).length === 0) row['Content'] = entry.content
    row['Logged By'] = entry.uploaded_by || ''
    row['Date Logged'] = new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    rows.push(row)
  }

  // Build Excel
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-size columns to the widest value (header or cell), with padding, capped at 50.
  const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
  ws['!cols'] = allKeys.map(key => ({
    wch: Math.min(50, Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 4)
  }))

  XLSX.utils.book_append_sheet(wb, ws, category)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${category.replace(/\s+/g, '_')}_Export.xlsx"`,
    },
  })
}
