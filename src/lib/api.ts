import { supabase } from '@/lib/supabase'
import type { Checkpoint, PatrolLog, Profile, Round } from '@/lib/types'

export interface RoundWithDetails extends Round {
  round_checkpoints: {
    id: string
    order_index: number
    checkpoints: Checkpoint
  }[]
}

const localDayRange = (date: string) => ({
  start: new Date(`${date}T00:00:00`).toISOString(),
  end: new Date(`${date}T23:59:59.999`).toISOString(),
})

export async function getGuardTodayRounds(guardId: string, date: string) {
  const { data, error } = await supabase
    .from('round_assignments')
    .select('round_id, rounds(*, round_checkpoints(*, checkpoints(*)))')
    .eq('guard_id', guardId)
    .eq('date', date)
    .eq('rounds.active', true)
  if (error) throw error
  return (data ?? []).map((a) => a.rounds).filter(Boolean) as RoundWithDetails[]
}

export async function getTodayPatrolLogs(guardId: string, date: string) {
  const { start, end } = localDayRange(date)
  const { data, error } = await supabase
    .from('patrol_logs')
    .select('*, checkpoints(name)')
    .eq('guard_id', guardId)
    .gte('scanned_at', start)
    .lte('scanned_at', end)
    .order('scanned_at', { ascending: false })
  if (error) throw error
  return data as (PatrolLog & { checkpoints: Pick<Checkpoint, 'name'> })[]
}

export async function getPatrolLogs(guardId: string, limit = 50) {
  const { data, error } = await supabase
    .from('patrol_logs')
    .select('*, checkpoints(name)')
    .eq('guard_id', guardId)
    .order('scanned_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as (PatrolLog & { checkpoints: Pick<Checkpoint, 'name'> })[]
}

export async function findCheckpointByQr(qrCode: string) {
  const { data, error } = await supabase
    .from('checkpoints')
    .select('*')
    .eq('qr_code', qrCode)
    .eq('active', true)
    .maybeSingle()
  if (error) throw error
  return data as Checkpoint | null
}

export async function getAssignableGuards(siteId: string | null) {
  let query = supabase
    .from('profiles')
    .select('*, sites(name)')
    .eq('role', 'satpam')
    .eq('active', true)
  if (siteId) query = query.eq('site_id', siteId)
  const { data, error } = await query.order('full_name')
  if (error) throw error
  return data as (Profile & { sites: { name: string } | null })[]
}

export async function getSites() {
  const { data, error } = await supabase.from('sites').select('*').order('name')
  if (error) throw error
  return data
}

export async function getCheckpoints(siteId?: string) {
  let query = supabase
    .from('checkpoints')
    .select('*, sites(name)')
    .order('name')
  if (siteId) query = query.eq('site_id', siteId)
  const { data, error } = await query
  if (error) throw error
  return data as (Checkpoint & { sites: { name: string } | null })[]
}

export async function getRounds(siteId?: string) {
  let query = supabase
    .from('rounds')
    .select('*, sites(name), round_checkpoints(*), round_assignments(*, profiles(full_name))')
    .order('start_time')
  if (siteId) query = query.eq('site_id', siteId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getIncidents(siteId?: string) {
  let query = supabase
    .from('incidents')
    .select('*, profiles(full_name), sites(name), incident_photos(*)')
    .order('reported_at', { ascending: false })
    .limit(100)
  if (siteId) query = query.eq('site_id', siteId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getLivePatrolLogs() {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('patrol_logs')
    .select(
      '*, profiles(full_name), checkpoints(name, site_id), rounds(name, start_time, end_time, tolerance_minutes)',
    )
    .gte('scanned_at', localDayRange(today).start)
    .order('scanned_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

export interface AssignmentCompliance {
  assignmentId: string
  guardId: string
  guardName: string
  roundId: string
  roundName: string
  startTime: string
  endTime: string
  toleranceMinutes: number
  points: { id: string; name: string }[]
  scannedIds: Set<string>
  missedIds: string[]
  doneCount: number
  status: 'waiting' | 'active' | 'done'
}

export async function getTodayCompliance() {
  const today = new Date().toISOString().slice(0, 10)
  const { start: dayStart, end: dayEnd } = localDayRange(today)
  const { data: assignments, error: aErr } = await supabase
    .from('round_assignments')
    .select(
      'id, guard_id, rounds(id, name, start_time, end_time, tolerance_minutes, round_checkpoints(checkpoints(id, name))), profiles(full_name)',
    )
    .eq('date', today)
  if (aErr) throw aErr

  const { data: logs, error: lErr } = await supabase
    .from('patrol_logs')
    .select('checkpoint_id, round_id, guard_id, scanned_at')
    .gte('scanned_at', dayStart)
    .lte('scanned_at', dayEnd)
  if (lErr) throw lErr

  const now = new Date()
  return (assignments ?? []).map((a) => {
    const r = a.rounds
    const points = (r?.round_checkpoints ?? []).map((rc) => rc.checkpoints)
    const [sh, sm] = (r?.start_time ?? '00:00').split(':').map(Number)
    const [eh, em] = (r?.end_time ?? '00:00').split(':').map(Number)
    const start = new Date(now).setHours(sh, sm, 0, 0) - (r?.tolerance_minutes ?? 0) * 60000
    const end = new Date(now).setHours(eh, em, 0, 0)
    const pointIds = new Set(points.map((p) => p.id))
    const roundLogs = (logs ?? []).filter((l) => {
      const t = new Date(l.scanned_at).getTime()
      return (
        l.guard_id === a.guard_id &&
        t >= start &&
        t <= end &&
        (l.round_id === r?.id || pointIds.has(l.checkpoint_id))
      )
    })
    const scannedIds = new Set(roundLogs.map((l) => l.checkpoint_id))
    const missedIds = points.filter((p) => !scannedIds.has(p.id)).map((p) => p.id)
    const status =
      points.length > 0 && scannedIds.size >= points.length
        ? 'done'
        : now.getTime() >= start && now.getTime() <= end
          ? 'active'
          : 'waiting'
    return {
      assignmentId: a.id,
      guardId: a.guard_id,
      guardName: a.profiles?.full_name ?? 'Satpam',
      roundId: r?.id ?? '',
      roundName: r?.name ?? 'Ronde',
      startTime: r?.start_time ?? '',
      endTime: r?.end_time ?? '',
      toleranceMinutes: r?.tolerance_minutes ?? 0,
      points: points.map((p) => ({ id: p.id, name: p.name })),
      scannedIds,
      missedIds,
      doneCount: scannedIds.size,
      status,
    } as AssignmentCompliance
  })
}