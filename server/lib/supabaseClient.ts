import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Lazy/safe Supabase client, mirroring the getGenAI() pattern already used
 * for Gemini in server.ts. The agent uses this client as its persistent
 * memory: every sensed reading and every decision it makes is written here,
 * and the agent reads it back on the next run to stay context-aware instead
 * of starting from zero each time.
 *
 * Required env vars (see .env.example):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (server-side only — never expose to the client bundle)
 */
let supabase: SupabaseClient | null = null;
let supabaseAnon: SupabaseClient | null = null;
let warnedMissingConfig = false;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (!warnedMissingConfig) {
      console.warn(
        '[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — agent will run in-memory only, nothing will be persisted.'
      );
      warnedMissingConfig = true;
    }
    return null;
  }

  if (!supabase) {
    supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAnon(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  if (!supabaseAnon) {
    supabaseAnon = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return supabaseAnon;
}
