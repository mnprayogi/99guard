import Dexie, { type Table } from 'dexie'
import type { IncidentCategory } from '@/lib/types'
import type { RoundWithDetails } from '@/lib/api'

export interface QueuedPatrolLog {
  id?: number
  guard_id: string
  checkpoint_id: string
  round_id: string | null
  lat: number | null
  lng: number | null
  photo_base64: string
  created_at: string
}

export interface QueuedIncident {
  id?: number
  guard_id: string
  site_id: string | null
  category: IncidentCategory
  description: string | null
  lat: number | null
  lng: number | null
  photo_base64: string
  created_at: string
}

export interface RoundsCacheEntry {
  date: string
  rounds: RoundWithDetails[]
  saved_at: string
}

export class GuardDB extends Dexie {
  patrolQueue!: Table<QueuedPatrolLog, number>
  incidentQueue!: Table<QueuedIncident, number>
  roundsCache!: Table<RoundsCacheEntry, string>

  constructor() {
    super('99guard-db')
    this.version(2).stores({
      patrolQueue: '++id, checkpoint_id, created_at',
      incidentQueue: '++id, category, created_at',
      roundsCache: 'date, saved_at',
    })
  }
}

export const db = new GuardDB()
