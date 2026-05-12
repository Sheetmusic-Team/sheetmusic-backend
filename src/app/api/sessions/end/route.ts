import { NextRequest, NextResponse } from 'next/server';
import { getStudentIdFromAuth } from '@/lib/auth';
import {
  updateProficiencies,
  saveSession
} from '@/services/studentService';
import { callDRLSessionEnd } from '@/services/drlService';
import { logRequest } from '@/lib/logRequest';

interface SessionEvent {
  node: string;
  correct: boolean;
  response_time: number;
  difficulty: number;
}

interface SessionEndRequestBody {
  session_events?: SessionEvent[];
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    await logRequest(request);
    console.log('[SessionEnd] ▶️ Request received');

    // 1. AUTH
    const student_id = await getStudentIdFromAuth(request);

    console.log('[SessionEnd] 🔐 Auth result:', { student_id });

    if (!student_id) {
      console.warn('[SessionEnd] ❌ Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. PARSE BODY
    let body: SessionEndRequestBody;

    try {
      body = await request.json();
      console.log('[SessionEnd] 📦 Raw body parsed');
    } catch (err) {
      console.error('[SessionEnd] ❌ Invalid JSON:', err);
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const events = body?.session_events ?? [];

    console.log('[SessionEnd] 📊 Events count:', events.length);

    if (events.length > 0) {
      console.log('[SessionEnd] 🧾 First event:', events[0]);
    } else {
      console.warn('[SessionEnd] ⚠️ Empty session (no events)');
    }

    // 3. DRL CALL (solo si hay eventos)
    let drlResult: any = null;

    if (events.length > 0) {
      console.log('[SessionEnd] 🚀 Calling DRL...');

      drlResult = await callDRLSessionEnd({
        student_id,
        session_events: events
      });

      console.log('[SessionEnd] 🤖 DRL result:', drlResult);

      if (!drlResult) {
        console.error('[SessionEnd] ❌ DRL returned null');
        throw new Error('DRL returned empty response');
      }

      // 4. UPDATE PROFICIENCIES
      if (drlResult.updated_proficiencies) {
        console.log(
          '[SessionEnd] 🧠 Updating proficiencies:',
          drlResult.updated_proficiencies
        );

        await updateProficiencies(
          student_id,
          drlResult.updated_proficiencies
        );
      }
    } else {
      console.log('[SessionEnd] ⏭️ Skipping DRL (empty session)');
    }

    // 5. SAVE SESSION (SIEMPRE)
    console.log('[SessionEnd] 💾 Saving session...');

    const savedSession = await saveSession(student_id, {
      total_reward: drlResult?.total_reward ?? 0,
      node_rewards: drlResult?.node_rewards ?? {},
      success_rate: drlResult?.success_rate ?? 0,
      events
    });

    console.log('[SessionEnd] ✅ Session saved:', savedSession);

    // 6. RESPONSE
    const duration = Date.now() - startTime;

    console.log(`[SessionEnd] 🏁 Completed in ${duration}ms`);

    return NextResponse.json({
      status: 'success',
      data: {
        session_id: savedSession?.session_id ?? null,
        total_reward: drlResult?.total_reward ?? 0,
        node_rewards: drlResult?.node_rewards ?? {},
        updated_proficiencies: drlResult?.updated_proficiencies ?? {},
        success_rate: drlResult?.success_rate ?? 0,
        drl_training_triggered:
          drlResult?.drl_training_triggered ?? false,
        next_recommendations:
          drlResult?.next_recommendations ?? [],
        buffer_size: drlResult?.buffer_size ?? 0
      }
    });

  } catch (error) {
    console.error('[SessionEnd] 💥 ERROR:', {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process session end'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  console.log('[SessionEnd] GET health check');

  return NextResponse.json({
    status: 'ok',
    message: 'Session endpoint ready'
  });
}