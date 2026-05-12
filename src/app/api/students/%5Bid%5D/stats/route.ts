import { NextRequest, NextResponse } from 'next/server';
import { getStudentIdFromAuth, verifyTeacher, verifyAdmin } from '@/lib/auth';
import { getStudentStats, getStudentProfile } from '@/services/studentService';

/**
 * GET /api/students/[id]/stats
 * Obtiene estadísticas del estudiante
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
    if (authenticatedUserId !== requestedStudentId) {
      const isTeacher = await verifyTeacher(request);
      const isAdmin = await verifyAdmin(request);

      if (!isTeacher && !isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden: cannot view other students stats' },
          { status: 403 }
        );
      }
    }

    // 3️⃣ OBTENER PERFIL Y ESTADÍSTICAS
    console.log(`[Stats] Fetching stats for student ${requestedStudentId}`);

    const profile = await getStudentProfile(requestedStudentId);
    const stats = await getStudentStats(requestedStudentId);

    // 4️⃣ RETORNAR RESULTADO
    return NextResponse.json({
      status: 'success',
      data: {
        profile: {
          id: profile.id,
          name: profile.name,
          created_at: profile.created_at
        },
        proficiencies: profile.proficiencies,
        statistics: stats
      }
    });
  } catch (error) {
    console.error('[Stats] Error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch statistics'
      },
      { status: 500 }
    );
  }
}
