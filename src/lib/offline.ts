import { db, type QueuedIncident, type QueuedPatrolLog } from '@/lib/db'
import { uploadPhoto } from '@/lib/photo'
import { supabase } from '@/lib/supabase'

function blobFromBase64(base64: string): Blob {
  const [meta, data] = base64.split(',')
  const mime = meta.match(/data:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function queuePatrolLog(
  log: Omit<QueuedPatrolLog, 'created_at'>,
): Promise<void> {
  await db.patrolQueue.add({ ...log, created_at: new Date().toISOString() })
}

export async function queueIncident(
  incident: Omit<QueuedIncident, 'created_at'>,
): Promise<void> {
  await db.incidentQueue.add({ ...incident, created_at: new Date().toISOString() })
}

export async function pendingCount(): Promise<number> {
  const [p, i] = await Promise.all([db.patrolQueue.count(), db.incidentQueue.count()])
  return p + i
}

export async function syncNow(): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0

  const patrolLogs = await db.patrolQueue.orderBy('created_at').toArray()
  for (const item of patrolLogs) {
    try {
      const photoUrl = await uploadPhoto(blobFromBase64(item.photo_base64), 'checkins')
      const { error } = await supabase.from('patrol_logs').insert({
        guard_id: item.guard_id,
        checkpoint_id: item.checkpoint_id,
        round_id: item.round_id,
        lat: item.lat,
        lng: item.lng,
        photo_url: photoUrl,
      })
      if (error) throw error
      await db.patrolQueue.delete(item.id!)
      synced++
    } catch {
      failed++
    }
  }

  const incidents = await db.incidentQueue.orderBy('created_at').toArray()
  for (const item of incidents) {
    try {
      const photoUrl = await uploadPhoto(blobFromBase64(item.photo_base64), 'incidents')
      const { data, error } = await supabase
        .from('incidents')
        .insert({
          guard_id: item.guard_id,
          category: item.category,
          description: item.description,
          lat: item.lat,
          lng: item.lng,
        })
        .select('id')
        .single()
      if (error) throw error
      if (photoUrl) {
        await supabase.from('incident_photos').insert({
          incident_id: data.id,
          photo_url: photoUrl,
        })
      }
      await db.incidentQueue.delete(item.id!)
      synced++
    } catch {
      failed++
    }
  }

  return { synced, failed }
}