import { supabase, supabaseKeyType } from '@/lib/supabase'

export async function GET() {
  const diagnostics: Record<string, string | null> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'OK' : null,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : null,
    used_key_type: supabaseKeyType ?? null,
  }

  let reachable = false
  let info: string | null = null

  try {
    const { data, error } = await supabase
      .schema('drl_testing')
      .from('users')
      .select('id')
      .limit(1)

    if (error) {
      info = `supabase query error: ${error.message}`
    } else {
      reachable = true
      info = `ok (${Array.isArray(data) ? data.length : 'n/a'} rows)`
    }
  } catch (e: unknown) {
    if (e instanceof Error) info = e.message
    else {
      try {
        info = JSON.stringify(e)
      } catch {
        info = Object.prototype.toString.call(e)
      }
    }
  }

  return Response.json({ diagnostics, reachable, info })
}