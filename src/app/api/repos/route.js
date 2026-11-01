import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = supabaseAdmin();

    const [reposRes, runsRes] = await Promise.all([
      db.from('repositories').select('*').order('updated_at', { ascending: false }),
      db.from('runs').select('*').order('started_at', { ascending: false }).limit(1),
    ]);

    if (reposRes.error) throw new Error(reposRes.error.message);
    if (runsRes.error) throw new Error(runsRes.error.message);

    return NextResponse.json({
      repos: reposRes.data || [],
      lastRun: (runsRes.data && runsRes.data[0]) || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String((err && err.message) || err) },
      { status: 500 }
    );
  }
}
