import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'

export async function POST(req: Request) {
  const { email, password, metadata } = await req.json()

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required' },
      { status: 400 }
    )
  }

  // Hashear contraseña
  const password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await supabase
    .schema('drl_testing')
    .from('users')
    .insert([
      {
        email,
        password_hash,
        metadata: metadata ?? null
      }
    ])
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  return NextResponse.json({ user: data })
}