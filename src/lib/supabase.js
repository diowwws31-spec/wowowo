import { createClient } from '@supabase/supabase-js';

let cached = null;

/**
 * Client Supabase server-side pakai SERVICE ROLE key.
 * Jangan pernah di-import dari komponen client — key ini nggak boleh bocor ke browser.
 */
export function supabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set di environment.');
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
