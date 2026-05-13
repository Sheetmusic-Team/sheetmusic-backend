import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCorsHeaders } from './lib/cors'

// Global middleware to apply CORS for API routes
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/api')) return NextResponse.next()

  const origin = request.headers.get('origin') || undefined

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) })
  }

  const res = NextResponse.next()
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

export const config = {
  matcher: '/api/:path*',
}
