import { supabase, supabaseKeyType } from '@/lib/supabase'

export const runtime = 'nodejs'

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
    // ⚠️ IMPORTANTE: evita schema() si no es necesario o puede fallar en producción
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (error) {
      reachable = false
      info = `supabase query error: ${error.message}`
    } else {
      reachable = true
      info = `ok (${data?.length ?? 0} rows)`
    }
  } catch (e: unknown) {
    reachable = false

    if (e instanceof Error) {
      info = e.message
    } else {
      try {
        info = JSON.stringify(e)
      } catch {
        info = Object.prototype.toString.call(e)
      }
    }
  }

  return Response.json({
    diagnostics,
    reachable,
    info,
  })
}