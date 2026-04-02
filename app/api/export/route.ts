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
    const row: Record<string, string> = {}
    const lines = (entry.content || '').split('\n')
    for (const line of lines) {
      // Match patterns like "Field: value" or "**Field:** value"
      const match = line.match(/^\*?\*?([^:*]+?):?\*?\*?\s*[:]\s*(.+)$/i) ||
                    line.match(/^\*?\*?([^:*]+)\*?\*?:\s*(.+)$/i)
      if (match) {
        const key = match[1].replace(/\*/g, '').trim()
        const val = match[2].replace(/\*/g, '').trim()
        if (key && val) row[key] = val
      }
    }
    if (entry.uploaded_by) row['Logged By'] = entry.uploaded_by
    row['Date Logged'] = new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    // Only add if we parsed at least one field
    if (Object.keys(row).length > 2) {
      rows.push(row)
    } else {
      // Fallback — just put raw content
      rows.push({ Content: entry.content, 'Logged By': entry.uploaded_by || '', 'Date Logged': row['Date Logged'] })
    }
  }

  // Build Excel
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-size columns
  const colWidths = Object.keys(rows[0] || {}).map(key => ({
    wch: Math.max(key.length, ...rows.map(r => (r[key] || '').length)).toString().length + 5
  }))
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, category)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${category.replace(/\s+/g, '_')}_Export.xlsx"`,
    },
  })
}
