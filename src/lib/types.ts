export type Role = 'superadmin' | 'admin' | 'satpam'

export type Profile = {
  id: string
  full_name: string
  role: Role
  site_id: string | null
  phone: string | null
  active: boolean
  created_at: string
}

export type Site = {
  id: string
  name: string
  address: string | null
  created_at: string
}

export type Checkpoint = {
  id: string
  site_id: string
  name: string
  description: string | null
  qr_code: string
  lat: number | null
  lng: number | null
  active: boolean
  created_at: string
}

export type Round = {
  id: string
  site_id: string
  name: string
  start_time: string
  end_time: string
  tolerance_minutes: number
  active: boolean
  created_at: string
}

export type RoundCheckpoint = {
  id: string
  round_id: string
  checkpoint_id: string
  order_index: number
}

export type RoundAssignment = {
  id: string
  round_id: string
  guard_id: string
  date: string
}

export type PatrolLog = {
  id: string
  round_id: string | null
  checkpoint_id: string
  guard_id: string
  scanned_at: string
  lat: number | null
  lng: number | null
  photo_url: string | null
  is_synced: boolean
  created_at: string
}

export type IncidentStatus = 'open' | 'in_progress' | 'resolved'
export type IncidentCategory = 'kebakaran' | 'pencurian' | 'vandalisme' | 'kesehatan' | 'lainnya'

export type Incident = {
  id: string
  site_id: string | null
  guard_id: string
  category: IncidentCategory
  description: string | null
  lat: number | null
  lng: number | null
  status: IncidentStatus
  reported_at: string
  updated_at: string
}

export type IncidentPhoto = {
  id: string
  incident_id: string
  photo_url: string | null
  created_at: string
}

export type IncidentAction = {
  id: string
  incident_id: string
  admin_id: string | null
  action: string
  note: string | null
  created_at: string
}

export type AdminCreateUserParams = {
  p_email: string
  p_password: string
  p_full_name: string
  p_role: Role
  p_site_id: string | null
}

export type AdminResetPasswordParams = {
  p_user_id: string
  p_new_password: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile>
        Update: Partial<Profile>
        Relationships: [{ foreignKeyName: string; columns: ['site_id']; referencedRelation: 'sites'; referencedColumns: ['id'] }]
      }
      sites: { Row: Site; Insert: Partial<Site>; Update: Partial<Site>; Relationships: [] }
      checkpoints: {
        Row: Checkpoint
        Insert: Partial<Checkpoint>
        Update: Partial<Checkpoint>
        Relationships: [{ foreignKeyName: string; columns: ['site_id']; referencedRelation: 'sites'; referencedColumns: ['id'] }]
      }
      rounds: {
        Row: Round
        Insert: Partial<Round>
        Update: Partial<Round>
        Relationships: [{ foreignKeyName: string; columns: ['site_id']; referencedRelation: 'sites'; referencedColumns: ['id'] }]
      }
      round_checkpoints: {
        Row: RoundCheckpoint
        Insert: Partial<RoundCheckpoint>
        Update: Partial<RoundCheckpoint>
        Relationships: [
          { foreignKeyName: string; columns: ['round_id']; referencedRelation: 'rounds'; referencedColumns: ['id'] },
          { foreignKeyName: string; columns: ['checkpoint_id']; referencedRelation: 'checkpoints'; referencedColumns: ['id'] },
        ]
      }
      round_assignments: {
        Row: RoundAssignment
        Insert: Partial<RoundAssignment>
        Update: Partial<RoundAssignment>
        Relationships: [
          { foreignKeyName: string; columns: ['round_id']; referencedRelation: 'rounds'; referencedColumns: ['id'] },
          { foreignKeyName: string; columns: ['guard_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      patrol_logs: {
        Row: PatrolLog
        Insert: Partial<PatrolLog>
        Update: Partial<PatrolLog>
        Relationships: [
          { foreignKeyName: string; columns: ['round_id']; referencedRelation: 'rounds'; referencedColumns: ['id'] },
          { foreignKeyName: string; columns: ['checkpoint_id']; referencedRelation: 'checkpoints'; referencedColumns: ['id'] },
          { foreignKeyName: string; columns: ['guard_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      incidents: {
        Row: Incident
        Insert: Partial<Incident>
        Update: Partial<Incident>
        Relationships: [
          { foreignKeyName: string; columns: ['site_id']; referencedRelation: 'sites'; referencedColumns: ['id'] },
          { foreignKeyName: string; columns: ['guard_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      incident_photos: {
        Row: IncidentPhoto
        Insert: Partial<IncidentPhoto>
        Update: Partial<IncidentPhoto>
        Relationships: [{ foreignKeyName: string; columns: ['incident_id']; referencedRelation: 'incidents'; referencedColumns: ['id'] }]
      }
      incident_actions: {
        Row: IncidentAction
        Insert: Partial<IncidentAction>
        Update: Partial<IncidentAction>
        Relationships: [
          { foreignKeyName: string; columns: ['incident_id']; referencedRelation: 'incidents'; referencedColumns: ['id'] },
          { foreignKeyName: string; columns: ['admin_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      client_logs: {
        Row: { id: string; user_id: string | null; page: string; step: string; message: string; meta: unknown; created_at: string }
        Insert: Partial<{ id: string; user_id: string | null; page: string; step: string; message: string; meta: unknown }>
        Update: Partial<{ id: string; user_id: string | null; page: string; step: string; message: string; meta: unknown }>
        Relationships: [{ foreignKeyName: string; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
    }
    Views: Record<string, never>
    Functions: {
      admin_create_user: {
        Args: AdminCreateUserParams
        Returns: string
      }
      admin_reset_password: {
        Args: AdminResetPasswordParams
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
