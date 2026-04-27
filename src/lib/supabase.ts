import { createClient } from '@supabase/supabase-js'

// Prefer using the SERVICE_ROLE key when available (server-only). Fall back to
// the public ANON key if the service role key isn't provided. Provide clear
// errors when required env vars are missing to make debugging easier.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null

const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY

if (!SUPABASE_URL) {
  throw new Error('Missing environment variable NEXT_PUBLIC_SUPABASE_URL')
}

if (!SUPABASE_KEY) {
  throw new Error(
    'Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY (server-only) or NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export const supabaseKeyType = SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon'