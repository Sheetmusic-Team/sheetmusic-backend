import { NextRequest, NextResponse } from 'next/server'
import { getStudentIdFromAuth } from '@/lib/auth'
import {
  getStudentState,
  calculateStudentLevel
} from '@/services/studentService'
import { callDRLNextExercise } from '@/services/drlService'
import { logRequest } from '@/lib/logRequest'

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
        { status: 401 }
      )
    }

  // 📊 STATE DRL
  const studentState = (await getStudentState(student_id)) as LocalStudentState

    // 🧠 DRL PREDICTION
    // Build the request body matching the expected DRL API shape
    const drlPayload = {
      student_id,
      student_state: {
        skill_proficiency: studentState.skill_proficiency,
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
    })
  } catch (error) {
    console.error('GET NEXT EXERCISE ERROR:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get next exercise'
      },
      { status: 500 }
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
        { status: 401 }
      )
    }

  // 📥 BODY (use body parsed by logRequest if available)
  const body: NextExerciseRequestBody = (loggedBody as NextExerciseRequestBody) || (await request.json())

  // 📊 STATE DRL
  const studentState = (await getStudentState(student_id)) as LocalStudentState

    console.log('FOCUS:', body.focus)

    // 🧠 DRL CALL (AQUÍ SE CONSTRUYE EL BODY SEGÚN EL FORMATO REQUERIDO)
    const postPayload = {
      student_id,
      student_state: {
        skill_proficiency: studentState.skill_proficiency,
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
    })
  } catch (error) {
    console.error('POST NEXT EXERCISE ERROR:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get next exercise'
      },
      { status: 500 }
    )
  }
}