import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Uses the service-role key so it can delete the auth account itself.
// SUPABASE_SERVICE_ROLE_KEY must be set in the environment (Vercel + .env.local).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST /api/account/delete — permanently delete a user's account and personal data
export async function POST(req: NextRequest) {
  const { userId, email } = await req.json()

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Account deletion is not configured yet. Add SUPABASE_SERVICE_ROLE_KEY to the environment.' },
      { status: 500 }
    )
  }

  // Remove the user's personal data first.
  await admin.from('documents').delete().eq('user_id', userId)
  await admin.from('conversations').delete().eq('user_id', userId)
  await admin.from('group_members').delete().eq('user_id', userId)
  if (email) await admin.from('group_members').delete().eq('email', email)
  await admin.from('profiles').delete().eq('user_id', userId)

  // Finally, delete the auth account itself.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
