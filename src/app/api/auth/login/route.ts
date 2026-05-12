import { supabaseAuth, drl } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

interface LoginRequest {
  email: string
  password: string
}

// ================================
// CORS CONFIG
// ================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://music-exercises-module.vercel.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// ================================
// OPTIONS (PRE-FLIGHT CORS)
// ================================
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

// ================================
// POST LOGIN
// ================================
export async function POST(req: NextRequest) {
  try {
    let body: LoginRequest

    try {
      body = (await req.json()) as LoginRequest
      console.log('=== incoming request (auth/login) ===')
      console.log('body:', body)
      console.log('=== end request ===')
    } catch (e) {
      console.warn('Could not parse request body:', e)
      body = { email: '', password: '' }
    }

    // VALIDACIÓN
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: 'Email y contraseña requeridos' },
        { status: 400, headers: corsHeaders }
      )
    }

    // AUTH SUPABASE
    const { data, error: authError } =
      await supabaseAuth.auth.signInWithPassword({
        email: body.email,
        password: body.password
      })

    if (authError || !data?.session || !data?.user) {
      console.warn('[LOGIN] Supabase auth error:', authError)
      console.warn('[LOGIN] Supabase auth response data:', data)
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401, headers: corsHeaders }
      )
    }

    const userId = data.user.id

    // DRL STUDENT
    const { data: student, error: studentError } = await drl
      .from('students')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (studentError) {
      return NextResponse.json(
        { error: studentError.message },
        { status: 500, headers: corsHeaders }
      )
    }

    if (!student) {
      return NextResponse.json(
        { error: 'Estudiante no encontrado en DRL' },
        { status: 404, headers: corsHeaders }
      )
    }

    // ACTIVITY LOG (no crítico)
    await drl
      .from('user_activity_sessions')
      .insert({ student_id: student.id })

    // RESPONSE OK
    return NextResponse.json(
      {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: userId,
          email: data.user.email
        },
        student: {
          id: student.id,
          name: student.name,
          user_id: student.user_id
        }
      },
      {
        status: 200,
        headers: corsHeaders
      }
    )

  } catch (error) {
    console.error('LOGIN ERROR:', error)

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      {
        status: 500,
        headers: corsHeaders
      }
    )
  }
}