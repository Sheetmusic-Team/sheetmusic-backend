import { NextResponse, NextRequest } from 'next/server'
import { getCorsHeaders } from '@/lib/cors'
import { createClient } from '@supabase/supabase-js'

// ========================================
// CONFIG
// ========================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const DRL_SCHEMA = process.env.DRL_SCHEMA || 'drl_testing'

if (!SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
}

if (!SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
}

// Cliente con service_role
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Cliente apuntando al schema DRL
const drl = supabase.schema(DRL_SCHEMA)

// ========================================
// OPTIONS
// ========================================

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req.headers.get('origin') || undefined) })
}

// ========================================
// POST
// ========================================

export async function POST(req: Request) {
  try {
    // log the incoming request
    // Note: this will attempt to parse JSON or text body for debugging
    try {
      // adapt Request to NextRequest-like shape by creating a NextRequest isn't trivial here;
      // instead, log minimal info: headers + body text
      const text = await req.text()
      console.log('=== incoming request (users/create) ===')
      console.log('method: POST')
      console.log('url: /api/users/create')
      console.log('headers:', Object.fromEntries(req.headers.entries()))
      console.log('body:', text)
      console.log('=== end request ===')
      // Recreate a streamable body for downstream parsing by creating a new Request
      req = new Request(req.url, { method: 'POST', headers: req.headers, body: text })
    } catch (e) {
      console.warn('Could not fully log request body for users/create:', e)
    }
    const body = await req.json()

    const email = body.email?.trim()
    const password = body.password?.trim()
    const name = body.name?.trim()

    // ========================================
    // VALIDACIONES
    // ========================================

    if (!email || !password) {
      return NextResponse.json(
        {
          error: 'Email and password are required'
        },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          error: 'Password must be at least 6 characters'
        },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          error: 'Invalid email format'
        },
        { status: 400 }
      )
    }

    // ========================================
    // 1. CREAR USUARIO AUTH
    // ========================================

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

    if (authError) {
      return NextResponse.json(
        {
          error: authError.message
        },
        { status: 400 }
      )
    }

    if (!authData.user?.id) {
      return NextResponse.json(
        {
          error: 'Failed to create auth user'
        },
        { status: 500 }
      )
    }

    const userId = authData.user.id

    // ========================================
    // 2. INSERT USERS
    // ========================================

    const { data: userData, error: userError } = await drl
      .from('users')
      .insert([
        {
          id: userId,
          email,
          role: 'student'
        }
      ])
      .select()
      .single()

    if (userError) {
      // rollback auth user
      await supabase.auth.admin.deleteUser(userId)

      return NextResponse.json(
        {
          error: userError.message
        },
        { status: 500 }
      )
    }

    // ========================================
    // 3. INSERT STUDENT
    // ========================================

    const { data: studentData, error: studentError } = await drl
      .from('students')
      .insert([
        {
          user_id: userId,
          name: name || email.split('@')[0]
        }
      ])
      .select()
      .single()

    if (studentError) {
      // rollback users table
      await drl.from('users').delete().eq('id', userId)

      // rollback auth user
      await supabase.auth.admin.deleteUser(userId)

      return NextResponse.json(
        {
          error: studentError.message
        },
        { status: 500 }
      )
    }

    // ========================================
    // SUCCESS
    // ========================================

    return NextResponse.json(
      {
        message: 'User created successfully',
        user: userData,
        student: studentData
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('REGISTER ERROR:', err)

    return NextResponse.json(
      {
        error: 'Internal server error'
      },
      { status: 500 }
    )
  }
}