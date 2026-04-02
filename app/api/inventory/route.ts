import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET /api/inventory?groupId=xxx — list all inventory items
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get('groupId')

  if (!groupId) return NextResponse.json({ items: [] })

  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('group_id', groupId)
    .order('item_name', { ascending: true })

  if (error) return NextResponse.json({ items: [] })
  return NextResponse.json({ items: data || [] })
}

// POST /api/inventory — add or update an inventory item
export async function POST(req: NextRequest) {
  const { groupId, itemName, quantity, userId, userRole, imageUrl } = await req.json()

  if (!groupId || !itemName) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Check if item already exists
  const { data: existing } = await supabase
    .from('inventory')
    .select('id, quantity')
    .eq('group_id', groupId)
    .ilike('item_name', itemName)
    .single()

  if (existing) {
    // Update quantity (add to existing)
    const newQty = (existing.quantity || 0) + (quantity || 0)
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: newQty, updated_by: userId, image_url: imageUrl || undefined })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, action: 'updated', newQuantity: newQty })
  } else {
    const { error } = await supabase
      .from('inventory')
      .insert({
        group_id: groupId,
        item_name: itemName,
        quantity: quantity || 0,
        image_url: imageUrl || null,
        added_by: userId,
        updated_by: userId,
      })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, action: 'added' })
  }
}

// PATCH /api/inventory — set quantity directly
export async function PATCH(req: NextRequest) {
  const { id, quantity, userId } = await req.json()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('inventory')
    .update({ quantity, updated_by: userId })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/inventory — remove an item
export async function DELETE(req: NextRequest) {
  const { id, userRole } = await req.json()

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (userRole !== 'owner' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can delete items' }, { status: 403 })
  }

  const { error } = await supabase.from('inventory').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
