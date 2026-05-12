/**
 * Servicio para comunicación con DRL Learning Engine
 */

interface DRLNextExerciseRequest {
  student_id: string;
  student_state: {
    skill_proficiency: Record<string, number>;
    preferred_node?: string | null;
    difficulty?: number | null;
    free_navigation: boolean;
  };
  focus?: {
    nodes: string[];
    strict: boolean;
  };
}

interface DRLSessionEndRequest {
  student_id: string;
  session_events: Array<{
    node: string;
    correct: boolean;
    response_time: number;
    difficulty: number;
  }>;
}

const DRL_ENGINE_URL =
  process.env.DRL_ENGINE_URL || 'http://localhost:8000';


// ======================================================
// 🚀 NEXT EXERCISE (FIXED - MATCH CURL EXACTLY)
// ======================================================

export async function callDRLNextExercise(request: DRLNextExerciseRequest) {
  try {
    const url = `${DRL_ENGINE_URL}/next-exercise`

    // Quick health check to fail fast if DRL engine is down or unreachable
    try {
      const healthy = await checkDRLHealth()
      if (!healthy) {
        throw new Error(
          `DRL engine health check failed. Not reachable at ${DRL_ENGINE_URL}`
        )
      }
    } catch (hcErr) {
      // Re-throw with clearer message
      throw new Error(
        `DRL engine not reachable at ${DRL_ENGINE_URL} (health check): ${hcErr instanceof Error ? hcErr.message : String(hcErr)}`
      )
    }

    console.log('➡️ Calling DRL next-exercise at', url)
    console.log('➡️ Payload sample:', {
      student_id: request.student_id,
      student_state: request.student_state,
      focus: request.focus
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // Send the full body including student_id to match the DRL API schema
      body: JSON.stringify({
        student_id: request.student_id,
        student_state: request.student_state,
        focus: request.focus
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DRL error (${response.status}): ${error}`);
    }

    const json = await response.json();

    console.log('🔥 RAW DRL RESPONSE:', json);

    // 🔥 FIX IMPORTANTE AQUÍ
    const data = json.data ?? json;

    return {
      node: data.recommended_node ?? data.node ?? null,
      difficulty: data.difficulty ?? null,
      exercise_data: data.exercise ?? null,
      focus_applied: data.focus_applied ?? false
    };

  } catch (error) {
    // Surface AbortError/timeouts clearly
    // Detect AbortError (fetch timeout) without using `any`
  const e = error
    if (
      typeof e === 'object' &&
      e !== null &&
      'name' in e &&
      (e as { name?: unknown }).name === 'AbortError'
    ) {
      const msg = `DRL request timed out after 10s when calling ${DRL_ENGINE_URL}`
      console.error('❌ DRL timeout:', msg)
      throw new Error(msg)
    }

    console.error('❌ DRL error:', error)
    if (error instanceof Error) throw error
    throw new Error(String(error))
  }
}


// ======================================================
// 🧠 SESSION END
// ======================================================

export async function callDRLSessionEnd(
  request: DRLSessionEndRequest
): Promise<{
  total_reward: number;
  node_rewards: Record<string, number>;
  updated_proficiencies: Record<string, number>;
  success_rate: number;
  drl_training_triggered: boolean;
  next_recommendations: string[];
  buffer_size: number;
}> {
  try {
    const response = await fetch(
      `${DRL_ENGINE_URL}/session-end`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DRL error (${response.status}): ${error}`);
    }

    const data = await response.json();

    return {
      total_reward: data.total_reward,
      node_rewards: data.node_rewards,
      updated_proficiencies: data.updated_proficiencies,
      success_rate: data.success_rate,
      drl_training_triggered: data.drl_training_triggered || false,
      next_recommendations: data.next_recommendations || [],
      buffer_size: data.buffer_size ?? 0
    };

  } catch (error) {
    console.error('❌ Error calling DRL session-end:', error);
    throw error;
  }
}


// ======================================================
// 📊 ANALYTICS
// ======================================================

export async function callDRLStudentAnalytics(
  student_id: string
): Promise<{
  sessions_count: number;
  average_reward: number;
  proficiencies: Record<string, number>;
}> {
  try {
    const response = await fetch(
      `${DRL_ENGINE_URL}/student-analytics/${student_id}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DRL error (${response.status}): ${error}`);
    }

    const data = await response.json();

    return {
      sessions_count: data.data?.sessions_count || 0,
      average_reward: data.data?.average_reward || 0,
      proficiencies: data.data?.proficiencies || {}
    };

  } catch (error) {
    console.error('Error calling DRL analytics:', error);
    throw error;
  }
}


// ======================================================
// 🩺 HEALTH CHECK
// ======================================================

export async function checkDRLHealth(): Promise<boolean> {
  try {
    const response = await fetch(
      `${DRL_ENGINE_URL}/health`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      }
    );

    return response.ok;

  } catch (error) {
    console.error('DRL health check failed:', error);
    return false;
  }
}


// ======================================================
// 🧬 MODEL VERSION
// ======================================================

export async function getDRLModelVersion(): Promise<string> {
  try {
    const response = await fetch(
      `${DRL_ENGINE_URL}/model-version`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get model version');
    }

    const data = await response.json();

    return data.version || 'unknown';

  } catch (error) {
    console.error('Error getting DRL model version:', error);
    return 'unknown';
  }
}