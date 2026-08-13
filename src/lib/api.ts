import { supabase } from '@/lib/supabase'
import type { Checkpoint, PatrolLog, Profile, Round } from '@/lib/types'

export interface RoundWithDetails extends Round {
  round_checkpoints: {
    id: string
    order_index: number
    checkpoints: Checkpoint
  }[]
}

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
  const start = `${date}T00:00:00.000Z`
  const end = `${date}T23:59:59.999Z`
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
  let query = supabase.from('profiles').select('*').eq('role', 'satpam').eq('active', true)
  if (siteId) query = query.eq('site_id', siteId)
  const { data, error } = await query.order('full_name')
  if (error) throw error
  return data as Profile[]
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
    .select('*, profiles(full_name), checkpoints(name, site_id)')
    .gte('scanned_at', `${today}T00:00:00.000Z`)
    .order('scanned_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}