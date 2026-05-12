import { NextRequest } from 'next/server'
import { supabaseAuth, drl } from './supabase'

export interface AuthUser {
  id: string
  email: string
  role: 'student' | 'teacher' | 'admin'
}

// ========================================
// VERIFY AUTH
// ========================================

export async function verifyAuth(
  request: NextRequest
): Promise<AuthUser | null> {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7)

    // 🔐 AUTH (Supabase Auth)
    const {
      data: { user },
      error
    } = await supabaseAuth.auth.getUser(token)

    if (error || !user) return null

    // 📊 DRL QUERY (ANTES ESTABA MAL EN public.users)
    const { data: userData } = await drl
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    return {
      id: user.id,
      email: user.email || '',
      role: userData?.role || 'student'
    }
  } catch (error) {
    console.error('Auth verification failed:', error)
    return null
  }
}

// ========================================
// GET STUDENT ID
// ========================================

export async function getStudentIdFromAuth(
  request: NextRequest
): Promise<string | null> {
  console.log('GET STUDENT ID FROM AUTH')

  const user = await verifyAuth(request)

  console.log('USER:', user)

  if (!user) {
    console.log('NO USER')
    return null
  }

  try {
    console.log('BUSCANDO STUDENT...')
    console.log('USER ID:', user.id)

    // 🔥 FIX CRÍTICO: usar DRL, no supabase
    const { data: student, error } = await drl
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .single()

    console.log('STUDENT:', student)
    console.log('ERROR:', error)

    if (error || !student) {
      console.log('NO STUDENT FOUND')
      return null
    }

    return student.id
  } catch (error) {
    console.error('Error getting student ID:', error)
    return null
  }
}

// ========================================
// ROLES
// ========================================

export async function verifyTeacher(request: NextRequest) {
  const user = await verifyAuth(request)
  return user?.role === 'teacher' || user?.role === 'admin'
}

export async function verifyAdmin(request: NextRequest) {
  const user = await verifyAuth(request)
  return user?.role === 'admin'
}