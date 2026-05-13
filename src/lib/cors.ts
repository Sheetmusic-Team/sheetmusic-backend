// Centralized CORS helpers used by API routes and middleware
export const allowedOrigins: string[] = [
  'https://music-exercises-module.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
]

export const defaultOrigin = allowedOrigins[0]

export function chooseOrigin(requestOrigin?: string) {
  if (!requestOrigin) return defaultOrigin
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : defaultOrigin
}

export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const origin = chooseOrigin(requestOrigin)
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

// Helper to merge CORS headers into a ResponseInit
export function withCors(init?: ResponseInit, requestOrigin?: string): ResponseInit {
  const headers = new Headers(init?.headers ?? undefined)
  const cors = getCorsHeaders(requestOrigin)
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v))
  if (!init) return { headers }
  return { status: init.status, statusText: init.statusText, headers }
}

const _default = { allowedOrigins, getCorsHeaders, withCors }
export default _default
