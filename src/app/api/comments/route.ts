import { NextRequest, NextResponse } from 'next/server';
import { drl } from '@/lib/supabase';
import { getCorsHeaders } from '@/lib/cors';
import { verifyAuth } from '@/lib/auth';

/**
 * POST /api/comments
 * Body: { content: string }
 * Auth: Bearer token (user must be authenticated)
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || undefined;
  try {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
    }

    // CORS check (origin header)
    if (!origin) {
      return NextResponse.json(
        { error: 'CORS: Missing Origin header' },
        { status: 403, headers: getCorsHeaders(origin) }
      );
    }

    // Auth: check Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header (no Bearer token)' },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    // Auth: verify token
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    const body = await request.json();
    const { content, studentId } = body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    let userIdToUse = user.id;
    if (studentId) {
      // Buscar el user_id correspondiente al studentId
      const { data: studentRow, error: studentError } = await drl
        .from('students')
        .select('user_id')
        .eq('id', studentId)
        .single();
      if (studentError || !studentRow || !studentRow.user_id) {
        return NextResponse.json(
          { error: 'Student not found or has no user_id' },
          { status: 404, headers: getCorsHeaders(origin) }
        );
      }
      userIdToUse = studentRow.user_id;
    }

    // Insert comment
    const { error } = await drl.from('comments').insert({
      user_id: userIdToUse,
      content: content.trim(),
      created_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json(
        { error: 'Failed to save comment', details: error.message },
        { status: 500, headers: getCorsHeaders(origin) }
      );
    }

    return NextResponse.json(
      { status: 'success' },
      { status: 201, headers: getCorsHeaders(origin) }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', details: (err as Error).message },
      { status: 500, headers: getCorsHeaders(origin) }
    );
  }
}

// CORS preflight handler
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request.headers.get('origin') || undefined) });
}
