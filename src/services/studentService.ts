import { drl } from '@/lib/supabase'
import fs from 'node:fs'
import path from 'node:path'

// ========================================
// TYPES
// ========================================

export interface StudentProfile {
  id: string
  user_id: string
  name: string
  created_at: string
  proficiencies: Record<string, number>
  total_sessions: number
}

export interface ProficiencyData {
  student_id: string
  node: string
  proficiency_level: number
}

export interface SessionData {
  id: string
  student_id: string
  total_reward: number
  node_rewards: Record<string, number>
  success_rate: number
  created_at: string
}

// ========================================
// PROFILE
// ========================================

export async function getStudentProfile(
  student_id: string
): Promise<StudentProfile> {
  // 📊 STUDENT
  const { data: student, error: studentError } = await drl
    .from('students')
    .select('*')
    .eq('id', student_id)
    .single()

  if (studentError)
    throw new Error(`Student not found: ${studentError.message}`)

  // 📊 PROFICIENCIES (new schema: student_proficiency.skill_proficiency JSONB)
  // Try to read the JSONB row; if missing, create a default with zeros for all known nodes.
  const { data: profRow, error: profRowError } = await drl
    .from('student_proficiency')
    .select('skill_proficiency, skill_profiency')
    .eq('student_id', student_id)
    .single()

  if (profRowError && !profRow) {
    // If the table or row doesn't exist, surface a clear error.
    // We'll fallback below to creating a default row when possible.
    console.warn(`Warning reading student_proficiency: ${profRowError.message}`)
  }
  // 📊 SESSIONS COUNT
  const { count: totalSessions, error: countError } = await drl
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student_id)

  if (countError)
    throw new Error(`Error counting sessions: ${countError.message}`)

  // 🧠 FORMAT - build proficiencies object from JSONB or create defaults
  let proficienciesObj: Record<string, number> = {}

  if (profRow) {
  const profRowTyped = profRow as Record<string, unknown>
  const raw = profRowTyped['skill_profiency'] ?? profRowTyped['skill_proficiency']
    if (raw && typeof raw === 'object') {
      proficienciesObj = raw as Record<string, number>
    } else {
      // if the row exists but column is empty/malformed, fall back to creating defaults
      proficienciesObj = await buildDefaultProficiencies(student_id)
    }
  } else {
    // No proficiency row found for this student: create a default with 0.0 for every known node
    try {
      const nodesPath = path.join(
        process.cwd(),
        'music-exercises-module',
        'data',
        'nodes.json'
      )

      let nodeIds: string[] = []
      if (fs.existsSync(nodesPath)) {
        const raw = fs.readFileSync(nodesPath, 'utf8')
        const parsed = JSON.parse(raw) as { nodes?: Array<{ id?: string }> }
        nodeIds = (parsed.nodes || []).map((n) => n.id || '').filter(Boolean)
      }

      nodeIds.forEach((id) => {
        proficienciesObj[id] = 0
      })

      // Insert a new row into student_proficiency with defaults
      const { error: insertError } = await drl
        .from('student_proficiency')
        .insert({
          student_id,
          skill_proficiency: proficienciesObj,
          updated_at: new Date().toISOString()
        })
        .select()

      if (insertError) {
        // If insertion fails (for example table missing or permissions), log and continue with empty proficiencies
        console.warn(`Could not create default student_proficiency: ${insertError.message}`)
      }
    } catch (err) {
      console.warn('Could not build default proficiency row:', err)
    }
  }

  return {
    id: student.id,
    user_id: student.user_id,
    name: student.name,
    created_at: student.created_at,
    proficiencies: proficienciesObj,
    total_sessions: totalSessions || 0
  }
}

// ========================================
// STATE (DRL INPUT)
// ========================================

export async function getStudentState(student_id: string) {
  const profile = await getStudentProfile(student_id)

  return {
    student_id: profile.id,
    skill_proficiency: profile.proficiencies,
    total_sessions: profile.total_sessions,
    created_at: profile.created_at
  }
}

// ========================================
// HISTORY
// ========================================

export async function getStudentHistory(
  student_id: string,
  limit: number = 20
) {
  const { data, error } = await drl
    .from('sessions')
    .select(
      `
      *,
      session_events (
        id,
        node,
        correct,
        difficulty,
        response_time,
        reward
      )
    `
    )
    .eq('student_id', student_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error)
    throw new Error(`Error fetching history: ${error.message}`)

  return data
}

// ========================================
// UPDATE PROFICIENCIES
// ========================================

export async function updateProficiencies(
  student_id: string,
  proficiencies: Record<string, number>
) {
  // Here `proficiencies` represents the deltas returned by the DRL engine
  // We must fetch the current JSONB, apply the deltas (addition), and
  // persist the merged object back into student_proficiency.skill_proficiency
  try {
    // Read existing row if any
    const { data: profRow } = await drl
      .from('student_proficiency')
      .select('skill_proficiency, skill_profiency')
      .eq('student_id', student_id)
      .single()

    let current: Record<string, number> = {}

    if (profRow) {
      const profRowTyped = profRow as Record<string, unknown>
      const raw = profRowTyped['skill_profiency'] ?? profRowTyped['skill_proficiency']
      if (raw && typeof raw === 'object') {
        current = raw as Record<string, number>
      } else {
        // Malformed existing row: build defaults
        current = await buildDefaultProficiencies(student_id)
      }
    } else {
      // No row: create defaults (and attempt to persist a default row)
      current = await buildDefaultProficiencies(student_id)
    }

    // Merge deltas: add each delta to the current value (or start at 0)
    const merged: Record<string, number> = { ...current }
    for (const [node, delta] of Object.entries(proficiencies || {})) {
      const prev = typeof merged[node] === 'number' ? merged[node] : 0
      // Add delta and keep two decimals
      const next = Math.round((prev + (delta ?? 0)) * 100) / 100
      merged[node] = next
    }

    // Persist merged object back to JSONB column
    const { error } = await drl
      .from('student_proficiency')
      .upsert(
        {
          student_id,
          skill_proficiency: merged,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'student_id' }
      )
      .select()

    if (error) {
      throw new Error(`Error updating proficiencies: ${error.message}`)
    }

    return merged
  } catch (err) {
    // Surface clear error
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to apply proficiency deltas: ${message}`)
  }
}

// ========================================
// SAVE SESSION
// ========================================

export async function saveSession(
  student_id: string,
  sessionData: {
    total_reward: number
    node_rewards: Record<string, number>
    success_rate: number
    events: Array<{
      node: string
      correct: boolean
      difficulty: number
      response_time: number
    }>
  }
) {
  // 📊 SESSION
  const { data: session, error: sessionError } = await drl
    .from('sessions')
    .insert({
      student_id,
      total_reward: sessionData.total_reward,
      node_rewards: sessionData.node_rewards,
      success_rate: sessionData.success_rate,
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  if (sessionError)
    throw new Error(`Error saving session: ${sessionError.message}`)

  // 📊 EVENTS
  const eventsData = sessionData.events.map((event) => ({
    session_id: session.id,
    node: event.node,
    correct: event.correct,
    difficulty: event.difficulty,
    response_time: event.response_time,
    reward: sessionData.node_rewards[event.node] || 0,
    created_at: new Date().toISOString()
  }))

  const { data: events, error: eventsError } = await drl
    .from('session_events')
    .insert(eventsData)
    .select()

  if (eventsError)
    throw new Error(`Error saving events: ${eventsError.message}`)

  return {
    session_id: session.id,
    session,
    events
  }
}

// ========================================
// STATS
// ========================================

export async function getStudentStats(student_id: string) {
  const { count: totalSessions } = await drl
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student_id)

  const { data: sessions } = await drl
    .from('sessions')
    .select('total_reward, success_rate')
    .eq('student_id', student_id)

  const avgReward =
    sessions && sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (s.total_reward || 0), 0) /
        sessions.length
      : 0

  const avgSuccessRate =
    sessions && sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (s.success_rate || 0), 0) /
        sessions.length
      : 0

  const { data: proficiencies } = await drl
    .from('student_proficiency')
    .select('skill_proficiency')
    .eq('student_id', student_id)

  let avgProficiency = 0
  if (proficiencies && proficiencies.length > 0) {
  const maybe = (proficiencies[0] as Record<string, unknown>)['skill_proficiency']
    if (typeof maybe === 'object' && maybe !== null) {
      const sp = maybe as Record<string, number>
      const vals = Object.values(sp || {})
      if (vals.length > 0) avgProficiency = vals.reduce((s, v) => s + (v || 0), 0) / vals.length
    }
  }
  
  return {
    total_sessions: totalSessions || 0,
    average_reward: Math.round(avgReward * 100) / 100,
    average_success_rate: Math.round(avgSuccessRate * 100) / 100,
    average_proficiency: Math.round(avgProficiency * 100) / 100
  }
}

// ========================================
// LEVEL
// ========================================

export function calculateStudentLevel(
  proficiencies: Record<string, number>
): string {
  const values = Object.values(proficiencies)

  if (values.length === 0) return 'beginner'

  const avgProf =
    values.reduce((a, b) => a + b, 0) / values.length

  if (avgProf < 0.3) return 'beginner'
  if (avgProf < 0.7) return 'intermediate'
  return 'advanced'
}

// Helper: build default proficiencies object and persist a row when possible
async function buildDefaultProficiencies(student_id: string): Promise<Record<string, number>> {
  const defaults: Record<string, number> = {}
  try {
    const nodesPath = path.join(
      process.cwd(),
      'music-exercises-module',
      'data',
      'nodes.json'
    )

    if (fs.existsSync(nodesPath)) {
      const raw = fs.readFileSync(nodesPath, 'utf8')
      const parsed = JSON.parse(raw) as { nodes?: Array<{ id?: string }> }
      const nodeIds = (parsed.nodes || []).map((n) => n.id || '').filter(Boolean)
      nodeIds.forEach((id) => {
        defaults[id] = 0
      })
    }

    // Attempt to insert the default row
    const { error: insertError } = await drl
      .from('student_proficiency')
      .insert({
        student_id,
        // try both column names in case the schema uses the misspelled one
        skill_proficiency: defaults,
        skill_profiency: defaults,
        updated_at: new Date().toISOString()
      })
      .select()

    if (insertError) {
      console.warn(`Could not create default student_proficiency: ${insertError.message}`)
    }
  } catch (error_) {
    console.warn('Could not build default proficiency row:', error_)
  }

  return defaults
}