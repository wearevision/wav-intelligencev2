// Generado desde el schema de Supabase. No editar a mano.
// Regenerar: npx supabase gen types typescript --project-id lrnaiwilairvvnqlyxdq
//
// Contrastado contra el schema real el 2026-09-13, tabla por tabla: sin deriva.
// Las columnas que en su momento se agregaron a mano —moderator_name,
// mic_number, media_files, media_kind— coinciden con lo que genera el CLI.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/**
 * supabase-js resuelve los selects mirando `Relationships` en cada tabla. Este
 * archivo las omite para no cargar el ruido de las claves foráneas, así que se
 * inyectan vacías: la inferencia de columnas funciona igual y los selects
 * anidados (que sí las necesitarían de verdad) no se usan — las consultas son
 * planas y se unen en JS.
 */
type WithRelationships<T> = { [K in keyof T]: T[K] & { Relationships: [] } }

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: WithRelationships<{
      artifacts: {
        Row: {
          bytes: number | null
          checksum: string | null
          created_at: string
          id: string
          kind: string
          producer: string
          session_id: string
          storage_key: string
        }
        Insert: {
          bytes?: number | null
          checksum?: string | null
          created_at?: string
          id?: string
          kind: string
          producer: string
          session_id: string
          storage_key: string
        }
        Update: {
          bytes?: number | null
          checksum?: string | null
          created_at?: string
          id?: string
          kind?: string
          producer?: string
          session_id?: string
          storage_key?: string
        }
      }
      media_files: {
        Row: {
          bytes: number | null
          checksum: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          kind: Database['public']['Enums']['media_kind']
          mic_number: number | null
          original_filename: string
          session_id: string
          source_host: string | null
          source_path: string | null
          storage_key: string
        }
        Insert: {
          bytes?: number | null
          checksum?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind: Database['public']['Enums']['media_kind']
          mic_number?: number | null
          original_filename: string
          session_id: string
          source_host?: string | null
          source_path?: string | null
          storage_key: string
        }
        Update: {
          bytes?: number | null
          checksum?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind?: Database['public']['Enums']['media_kind']
          mic_number?: number | null
          original_filename?: string
          session_id?: string
          source_host?: string | null
          source_path?: string | null
          storage_key?: string
        }
      }
      participants: {
        Row: {
          created_at: string
          id: string
          mic_number: number | null
          name: string
          seat_number: number | null
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mic_number?: number | null
          name: string
          seat_number?: number | null
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mic_number?: number | null
          name?: string
          seat_number?: number | null
          session_id?: string
        }
      }
      pipeline_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          session_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          session_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          session_id?: string
          started_at?: string | null
          status?: string
        }
      }
      pipeline_steps: {
        Row: {
          attempt: number
          error: string | null
          finished_at: string | null
          id: string
          name: string
          position: number
          run_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempt?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          name: string
          position: number
          run_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempt?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          name?: string
          position?: number
          run_id?: string
          started_at?: string | null
          status?: string
        }
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database['public']['Enums']['user_role']
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role: Database['public']['Enums']['user_role']
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database['public']['Enums']['user_role']
          updated_at?: string
        }
      }
      session_moderators: {
        Row: { assigned_at: string; profile_id: string; session_id: string }
        Insert: { assigned_at?: string; profile_id: string; session_id: string }
        Update: { assigned_at?: string; profile_id?: string; session_id?: string }
      }
      sessions: {
        Row: {
          block_number: number | null
          code: string | null
          created_at: string
          created_by: string | null
          day_number: number | null
          id: string
          moderator_guide: string | null
          moderator_name: string | null
          name: string
          objective: string | null
          scheduled_at: string | null
          status: Database['public']['Enums']['session_status']
          study_id: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          block_number?: number | null
          created_at?: string
          created_by?: string | null
          day_number?: number | null
          id?: string
          moderator_guide?: string | null
          moderator_name?: string | null
          name: string
          objective?: string | null
          scheduled_at?: string | null
          status?: Database['public']['Enums']['session_status']
          study_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          block_number?: number | null
          created_at?: string
          created_by?: string | null
          day_number?: number | null
          id?: string
          moderator_guide?: string | null
          moderator_name?: string | null
          name?: string
          objective?: string | null
          scheduled_at?: string | null
          status?: Database['public']['Enums']['session_status']
          study_id?: string | null
          updated_at?: string
          venue?: string | null
        }
      }
      studies: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string | null
          fieldwork_start: string | null
          id: string
          name: string
          status: Database['public']['Enums']['study_status']
          template_id: string | null
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          fieldwork_start?: string | null
          id?: string
          name: string
          status?: Database['public']['Enums']['study_status']
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          fieldwork_start?: string | null
          id?: string
          name?: string
          status?: Database['public']['Enums']['study_status']
          template_id?: string | null
          updated_at?: string
        }
      }
      study_stage_files: {
        Row: {
          bytes: number | null
          filename: string | null
          id: string
          is_required: boolean
          label: string
          storage_key: string | null
          study_stage_id: string
          uploaded_at: string | null
        }
        Insert: {
          bytes?: number | null
          filename?: string | null
          id?: string
          is_required?: boolean
          label: string
          storage_key?: string | null
          study_stage_id: string
          uploaded_at?: string | null
        }
        Update: {
          bytes?: number | null
          filename?: string | null
          id?: string
          is_required?: boolean
          label?: string
          storage_key?: string | null
          study_stage_id?: string
          uploaded_at?: string | null
        }
      }
      study_stages: {
        Row: {
          completed_at: string | null
          due_on: string | null
          id: string
          name: string
          offset_days: number
          position: number
          status: Database['public']['Enums']['stage_status']
          study_id: string
        }
        Insert: {
          completed_at?: string | null
          due_on?: string | null
          id?: string
          name: string
          offset_days: number
          position: number
          status?: Database['public']['Enums']['stage_status']
          study_id: string
        }
        Update: {
          completed_at?: string | null
          due_on?: string | null
          id?: string
          name?: string
          offset_days?: number
          position?: number
          status?: Database['public']['Enums']['stage_status']
          study_id?: string
        }
      }
      study_tasks: {
        Row: {
          done_at: string | null
          due_on: string | null
          id: string
          is_blocking: boolean
          name: string
          offset_days: number | null
          position: number
          study_stage_id: string
        }
        Insert: {
          done_at?: string | null
          due_on?: string | null
          id?: string
          is_blocking?: boolean
          name: string
          offset_days?: number | null
          position: number
          study_stage_id: string
        }
        Update: {
          done_at?: string | null
          due_on?: string | null
          id?: string
          is_blocking?: boolean
          name?: string
          offset_days?: number | null
          position?: number
          study_stage_id?: string
        }
      }
      study_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
      }
      template_stage_files: {
        Row: { id: string; is_required: boolean; label: string; template_stage_id: string }
        Insert: { id?: string; is_required?: boolean; label: string; template_stage_id: string }
        Update: { id?: string; is_required?: boolean; label?: string; template_stage_id?: string }
      }
      template_stages: {
        Row: { id: string; name: string; offset_days: number; position: number; template_id: string }
        Insert: { id?: string; name: string; offset_days: number; position: number; template_id: string }
        Update: {
          id?: string
          name?: string
          offset_days?: number
          position?: number
          template_id?: string
        }
      }
      template_tasks: {
        Row: {
          id: string
          is_blocking: boolean
          name: string
          offset_days: number | null
          position: number
          template_stage_id: string
        }
        Insert: {
          id?: string
          is_blocking?: boolean
          name: string
          offset_days?: number | null
          position: number
          template_stage_id: string
        }
        Update: {
          id?: string
          is_blocking?: boolean
          name?: string
          offset_days?: number | null
          position?: number
          template_stage_id?: string
        }
      }
    }>
    Views: Record<never, never>
    Functions: {
      create_study_from_template: {
        Args: {
          p_client_name?: string
          p_fieldwork_start?: string
          p_name: string
          p_template_id: string
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
    }
    Enums: {
      media_kind: 'video_360' | 'video_dslr' | 'audio_room' | 'audio_mic' | 'audio_ambient'
      session_status: 'scheduled' | 'uploaded' | 'processing' | 'ready' | 'error'
      stage_status: 'pending' | 'in_progress' | 'done' | 'skipped'
      study_status: 'active' | 'archived'
      user_role: 'admin' | 'client' | 'moderator'
    }
    CompositeTypes: Record<never, never>
  }
}

type DefaultSchema = Database['public']

export type Tables<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Update']
export type Enums<T extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][T]
