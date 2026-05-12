import { NextRequest } from 'next/server'

export async function logRequest(req: NextRequest) {
  try {
    console.log('=== incoming request ===')
    console.log('method:', req.method)
    console.log('url:', req.url)

    // headers
    const headers: Record<string, string> = {}
    for (const [k, v] of req.headers) {
      headers[k] = v
    }
    console.log('headers:', headers)

    // Read body from a clone so original request body remains consumable
    let body: unknown = null
    const clone = req.clone()
    try {
      try {
        body = await clone.json()
      } catch (error_) {
        // not JSON -> try text
        try {
          body = await clone.text()
        } catch (error_) {
          console.warn('Could not read request body as text:', error_)
          body = null
        }
      }
    } catch (error_) {
      console.warn('Could not clone/read request body:', error_)
      body = null
    }

    console.log('body:', body)
    console.log('=== end request ===')
    return body
  } catch (err) {
    console.error('Failed to log request:', err)
  }
  return null
}
