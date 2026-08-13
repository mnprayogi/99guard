import Dexie, { type Table } from 'dexie'
import type { IncidentCategory } from '@/lib/types'

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
  category: IncidentCategory
  description: string | null
  lat: number | null
  lng: number | null
  photo_base64: string
  created_at: string
}

export class GuardDB extends Dexie {
  patrolQueue!: Table<QueuedPatrolLog, number>
  incidentQueue!: Table<QueuedIncident, number>

  constructor() {
    super('99guard-db')
    this.version(1).stores({
      patrolQueue: '++id, checkpoint_id, created_at',
      incidentQueue: '++id, category, created_at',
    })
  }
}

export const db = new GuardDB()