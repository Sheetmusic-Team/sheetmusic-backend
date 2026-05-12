import { NextRequest, NextResponse } from 'next/server';
import { getStudentIdFromAuth, verifyTeacher, verifyAdmin } from '@/lib/auth';
import {
  getStudentHistory,
  getStudentStats
} from '@/services/studentService';

/**
 * GET /api/students/[id]/history
 * Obtiene historial de sesiones del estudiante
 */
export async function GET(
  request: NextRequest,
  context: { params: Record<string, string> | Promise<Record<string, string>> }
) {
  try {
    // Normalizar params: algunas versiones/typedefs de Next usan Promise para context.params
    const rawParams = context?.params as
      | Record<string, string>
      | Promise<Record<string, string>>
      | undefined;

    const isPromiseLike =
      rawParams !== undefined && typeof (rawParams as { then?: unknown }).then === 'function';

    const params: Record<string, string> = isPromiseLike
      ? await rawParams
      : (rawParams as Record<string, string> | undefined) ?? {};

    // 1️⃣ VERIFICAR AUTENTICACIÓN
    const authenticatedUserId = await getStudentIdFromAuth(request);
    const requestedStudentId = String(params.id ?? '');

    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2️⃣ VERIFICAR PERMISOS
    // Solo el estudiante o un profesor/admin pueden ver el historial
    if (authenticatedUserId !== requestedStudentId) {
      const isTeacher = await verifyTeacher(request);
      const isAdmin = await verifyAdmin(request);

      if (!isTeacher && !isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden: cannot view other students history' },
          { status: 403 }
        );
      }
    }

    // 3️⃣ OBTENER PARÁMETROS DE QUERY
    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const includedStats = searchParams.get('stats') === 'true';

    // 4️⃣ OBTENER HISTORIAL
    console.log(`[History] Fetching history for student ${requestedStudentId}`);

    const history = await getStudentHistory(requestedStudentId, limit);

    // 5️⃣ OBTENER ESTADÍSTICAS (OPCIONAL)
    let stats = null;
    if (includedStats) {
      console.log(
        `[History] Fetching stats for student ${requestedStudentId}`
      );
      stats = await getStudentStats(requestedStudentId);
    }

    // 6️⃣ RETORNAR RESULTADO
    return NextResponse.json({
      status: 'success',
      data: {
        sessions: history,
        stats,
        total_sessions: history.length
      }
    });
  } catch (error) {
    console.error('[History] Error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch history'
      },
      { status: 500 }
    );
  }
}
