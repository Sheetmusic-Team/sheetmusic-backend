import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? null

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null

const SUPABASE_KEY =
  SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY

const DRL_SCHEMA = process.env.DRL_SCHEMA || 'drl_testing'

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL')
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_KEY')

// 🔐 AUTH CLIENT
export const supabaseAuth = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
)

// 🧠 DRL CLIENT (IMPORTANTE)
export const drl = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
).schema(DRL_SCHEMA)