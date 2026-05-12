import { NextRequest, NextResponse } from 'next/server';
import { getStudentIdFromAuth, verifyTeacher, verifyAdmin } from '@/lib/auth';
import { getStudentStats, getStudentProfile } from '@/services/studentService';

/**
 * GET /api/students/[id]/stats
 * Obtiene estadísticas del estudiante
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1️⃣ VERIFICAR AUTENTICACIÓN
    const authenticatedUserId = await getStudentIdFromAuth(request);
    const requestedStudentId = params.id;

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
