import { NextRequest, NextResponse } from 'next/server'
import { getStudentIdFromAuth } from '@/lib/auth'
import {
  getStudentState,
  calculateStudentLevel
} from '@/services/studentService'
import { callDRLNextExercise } from '@/services/drlService'
import { logRequest } from '@/lib/logRequest'
import { drl } from '@/lib/supabase'
import { getCorsHeaders } from '@/lib/cors'

interface NextExerciseRequestBody {
  focus?: {
    nodes: string[]
    strict?: boolean
  }
}

// Normaliza distintos formatos que devuelve el motor DRL a un objeto
// de ejercicio uniforme que el frontend espera. Devuelve null si no hay.
function normalizeExercise(drlExercise: unknown) {
  if (!drlExercise) return null;
  // Algunos endpoints pueden devolver el prompt en diferentes campos.
  const d = drlExercise as Record<string, unknown>;

  const prompt =
    (d['prompt'] as string) ||
    (d['exercise'] as string) ||
    ((d['data'] as Record<string, unknown>)?.['exercise'] as string) ||
    (d['question'] as string) ||
    null;

  const normalized = {
    node: (d['node'] as string) || (d['node_id'] as string) || (d['nodeName'] as string) || null,
    type: (d['type'] as string) || 'teorico',
    difficulty: (d['difficulty'] as number) ?? null,
    prompt,
    expected_answer: (d['expected_answer'] as string) ?? (d['answer'] as string) ?? null,
    presentation_format: (d['presentation_format'] as string) ?? (d['presentation'] as string) ?? null,
    data: d['data'] ?? d['payload'] ?? null,
  };

  // If the DRL returned the exercise text directly (string), place it in prompt
  if (typeof drlExercise === 'string') {
    normalized.prompt = drlExercise;
  }

  return normalized;
}

// Local type describing expected student state shape returned by getStudentState
interface LocalStudentState {
  student_id?: string
  skill_proficiency: Record<string, number>
  total_sessions?: number
  preferred_node?: string
  difficulty?: number
  created_at?: string
}

/**
 * GET /api/exercises/next
 */
export async function GET(request: NextRequest) {
  try {
    await logRequest(request)
    // 🔐 AUTH
    const student_id = await getStudentIdFromAuth(request)

    if (!student_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: getCorsHeaders(request.headers.get('origin') || undefined) }
      )
    }

  // 📊 STATE DRL
  const studentState = (await getStudentState(student_id)) as LocalStudentState

    // Read skill_proficiency JSONB from DB directly (column: student_proficiency.skill_proficiency)
    let skill_proficiency: Record<string, number> = studentState.skill_proficiency || {}
    try {
      const { data: profRow, error: profErr } = await drl
        .from('student_proficiency')
        .select('skill_proficiency')
        .eq('student_id', student_id)
        .single()
      if (!profErr && profRow && typeof profRow['skill_proficiency'] === 'object') {
        skill_proficiency = profRow['skill_proficiency'] as Record<string, number>
      }
    } catch (e) {
      console.warn('Could not read student_proficiency row, falling back to getStudentState', e)
    }

    // 🧠 DRL PREDICTION
    // Build the request body matching the expected DRL API shape
    const drlPayload = {
      student_id,
      student_state: {
        skill_proficiency: skill_proficiency,
        preferred_node: studentState.preferred_node ?? null,
        difficulty: studentState.difficulty ?? null,
        free_navigation: true
      }
    }

    const drlPrediction = await callDRLNextExercise(drlPayload)

    const exercise = normalizeExercise(drlPrediction.exercise_data) ?? drlPrediction.exercise_data;

    return NextResponse.json({
      status: 'success',
      data: {
        node: drlPrediction.node,
        difficulty: drlPrediction.difficulty,
        exercise,
        metadata: {
          session_number: (studentState.total_sessions ?? 0) + 1,
          student_level: calculateStudentLevel(
            studentState.skill_proficiency
          )
        }
      }
    }, { headers: getCorsHeaders(request.headers.get('origin') || undefined) })
  } catch (error) {
    console.error('GET NEXT EXERCISE ERROR:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get next exercise'
      },
      { status: 500, headers: getCorsHeaders(request.headers.get('origin') || undefined) }
    )
  }
}

/**
 * POST /api/exercises/next
 */
export async function POST(request: NextRequest) {
  try {
  const loggedBody = await logRequest(request)
    // 🔐 AUTH
    const student_id = await getStudentIdFromAuth(request)

    if (!student_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: getCorsHeaders(request.headers.get('origin') || undefined) }
      )
    }

  // 📥 BODY (use body parsed by logRequest if available)
  const body: NextExerciseRequestBody = (loggedBody as NextExerciseRequestBody) || (await request.json())

  // 📊 STATE DRL
  const studentState = (await getStudentState(student_id)) as LocalStudentState

    console.log('FOCUS:', body.focus)

    // Read skill_proficiency from DB for POST as well
    let skill_proficiency_post: Record<string, number> = studentState.skill_proficiency || {}
    try {
      const { data: profRow, error: profErr } = await drl
        .from('student_proficiency')
        .select('skill_proficiency')
        .eq('student_id', student_id)
        .single()
      if (!profErr && profRow && typeof profRow['skill_proficiency'] === 'object') {
        skill_proficiency_post = profRow['skill_proficiency'] as Record<string, number>
      }
    } catch (e) {
      console.warn('Could not read student_proficiency row for POST, falling back to getStudentState', e)
    }

    // 🧠 DRL CALL (AQUÍ SE CONSTRUYE EL BODY SEGÚN EL FORMATO REQUERIDO)
    const postPayload = {
      student_id,
      student_state: {
        skill_proficiency: skill_proficiency_post,
        preferred_node: studentState.preferred_node ?? null,
        difficulty: studentState.difficulty ?? null,
        free_navigation: true
      },
      focus: body.focus
        ? {
            nodes: body.focus.nodes,
            strict: body.focus.strict ?? false
          }
        : undefined
    }

    const drlPrediction = await callDRLNextExercise(postPayload)

    console.log('DRL RESULT:', drlPrediction)

    const exercise = normalizeExercise(drlPrediction.exercise_data) ?? drlPrediction.exercise_data;

    return NextResponse.json({
      status: 'success',
      data: {
        node: drlPrediction.node,
        difficulty: drlPrediction.difficulty,
        exercise,
        focus_applied: drlPrediction.focus_applied,
        metadata: {
          session_number: (studentState.total_sessions ?? 0) + 1,
          student_level: calculateStudentLevel(
            studentState.skill_proficiency
          )
        }
      }
    }, { headers: getCorsHeaders(request.headers.get('origin') || undefined) })
  } catch (error) {
    console.error('POST NEXT EXERCISE ERROR:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get next exercise'
      },
      { status: 500, headers: getCorsHeaders(request.headers.get('origin') || undefined) }
    )
  }
}

// OPTIONS preflight handler with explicit CORS headers
export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request.headers.get('origin') || undefined) })
}