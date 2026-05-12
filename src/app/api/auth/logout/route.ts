import { NextRequest, NextResponse } from 'next/server'
import { getStudentIdFromAuth } from '@/lib/auth'
import { drl } from '@/lib/supabase'

// CORS config (same origin used in login)
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://music-exercises-module.vercel.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function POST(request: NextRequest) {
  try {
    console.log('[AuthLogout] Request received')

    const student_id = await getStudentIdFromAuth(request)
    console.log('[AuthLogout] Auth result:', { student_id })

    if (!student_id) {
      console.warn('[AuthLogout] Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
    }

    // Find latest active activity session for this student
    try {
      const { data: activeRows, error: activeErr } = await drl
        .from('user_activity_sessions')
        .select('*')
        .eq('student_id', student_id)
        .eq('active', true)
        .order('login_at', { ascending: false })
        .limit(1)

      if (activeErr) {
        console.warn('[AuthLogout] Could not query active activity session:', activeErr)
        // don't fail logout to the client
        return NextResponse.json({ status: 'ok', message: 'logout processed (db query failed)' }, { headers: corsHeaders })
      }

      if (!Array.isArray(activeRows) || activeRows.length === 0) {
        console.log('[AuthLogout] No active session found for student:', student_id)
        return NextResponse.json({ status: 'ok', message: 'no active session' }, { headers: corsHeaders })
      }

      const row = activeRows[0]
      const loginAt = new Date(row.login_at).getTime()
      const now = Date.now()
      const durationSeconds = Math.max(0, Math.floor((now - loginAt) / 1000))

      const { error: updErr } = await drl
        .from('user_activity_sessions')
        .update({ logout_at: new Date().toISOString(), duration_seconds: durationSeconds, active: false })
        .eq('id', row.id)

      if (updErr) {
        console.warn('[AuthLogout] Could not update activity session:', updErr)
        return NextResponse.json({ status: 'ok', message: 'logout processed (db update failed)' }, { headers: corsHeaders })
      }

      console.log('[AuthLogout] activity session closed for student:', student_id)

      return NextResponse.json({ status: 'ok', message: 'logout processed' }, { headers: corsHeaders })
    } catch (e) {
      console.warn('[AuthLogout] activity close failed:', e)
      return NextResponse.json({ status: 'ok', message: 'logout processed (exception)' }, { headers: corsHeaders })
    }

  } catch (error) {
    console.error('[AuthLogout] ERROR:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders })
  }
}
