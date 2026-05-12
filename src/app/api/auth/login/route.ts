import { supabaseAuth, drl } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

interface LoginRequest {
  email: string
  password: string
}

export async function POST(req: NextRequest) {
  try {
    // Log the incoming request (body + headers)
    let body: LoginRequest
    try {
      body = (await req.json()) as LoginRequest
      console.log('=== incoming request (auth/login) ===')
      console.log('method: POST')
      console.log('url:', req.url)
      console.log('headers:', Object.fromEntries(req.headers.entries()))
      console.log('body:', body)
      console.log('=== end request ===')
    } catch (e) {
      console.warn('Could not parse login request body for logging:', e)
      body = { email: '', password: '' }
    }

    // ========================================
    // VALIDACIÓN BÁSICA
    // ========================================
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: 'Email y contraseña requeridos' },
        { status: 400 }
      )
    }

    // ========================================
    // AUTH SUPABASE
    // ========================================
    const { data, error: authError } =
      await supabaseAuth.auth.signInWithPassword({
        email: body.email,
        password: body.password
      })

    if (authError || !data.session || !data.user) {
      console.error('AUTH ERROR:', authError)

      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    const userId = data.user.id

    console.log('AUTH USER ID:', userId)

    // ========================================
    // BUSCAR STUDENT EN DRL SCHEMA
    // ========================================
    const { data: student, error: studentError } = await drl
      .from('students')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    console.log('STUDENT:', student)
    console.log('STUDENT ERROR:', studentError)

    if (studentError) {
      return NextResponse.json(
        { error: studentError.message },
        { status: 500 }
      )
    }

    if (!student) {
      return NextResponse.json(
        { error: 'Estudiante no encontrado en DRL' },
        { status: 404 }
      )
    }

    // ========================================
    // REGISTER ACTIVITY SESSION (login)
    // ========================================
    try {
      const { data: activityInsert, error: activityError } = await drl
        .from('user_activity_sessions')
        .insert({ student_id: student.id })
        .select()
        .maybeSingle()

      if (activityError) {
        console.warn('[Login] Could not insert user_activity_sessions row:', activityError)
      } else {
        console.log('[Login] activity session created:', activityInsert)
      }
    } catch (e) {
      console.warn('[Login] activity insert failed:', e)
    }

    // ========================================
    // RESPONSE OK
    // ========================================
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
      { status: 200 }
    )
  } catch (error) {
    console.error('LOGIN ERROR:', error)

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}