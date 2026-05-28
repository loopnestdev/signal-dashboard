import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Full Supabase schema type required by SupabaseClient<T> — generated shape
// matches what `supabase gen types typescript` would produce for this table.
// signal-dashboard uses the `signal` schema within the shared coredb project.
export type Database = {
  signal: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          status: 'pending' | 'approved';
          is_admin: boolean;
          requested_at: string;
          approved_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          status?: 'pending' | 'approved';
          is_admin?: boolean;
          requested_at?: string;
          approved_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          status?: 'pending' | 'approved';
          is_admin?: boolean;
          requested_at?: string;
          approved_at?: string | null;
        };
        Relationships: [];
      };
      watchlists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          tickers: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          tickers?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          tickers?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// null when env vars are absent — app silently falls back to localStorage mode
export const supabase: SupabaseClient<Database, 'signal'> | null =
  url && key ? createClient<Database, 'signal'>(url, key, { db: { schema: 'signal' } }) : null;
