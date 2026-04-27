import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'

export async function POST(req: Request) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required' },
      { status: 400 }
    )
  }

  // 1. Buscar usuario
  const { data: user, error } = await supabase
    .schema('drl_testing')
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !user) {
    return NextResponse.json(
      { error: 'invalid credentials' },
      { status: 401 }
    )
  }

  // 2. Comparar password
  const isValid = await bcrypt.compare(password, user.password_hash)

  if (!isValid) {
    return NextResponse.json(
      { error: 'invalid credentials' },
      { status: 401 }
    )
  }

  // 3. Crear sesión (tu tabla sessions)
  const { data: session } = await supabase
    .schema('drl_testing')
    .from('sessions')
    .insert([
      {
        user_id: user.id
      }
    ])
    .select()
    .single()

  // 4. Respuesta
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      metadata: user.metadata
    },
    session: session
  })
}