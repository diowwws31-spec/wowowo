import { NextResponse } from 'next/server';
import { runScrape } from '@/lib/scrape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function handle(request) {
  // Kalau CRON_SECRET di-set, wajib kirim Authorization: Bearer <secret>.
  // Vercel Cron otomatis mengirim header ini.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const result = await runScrape({ force });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: String((err && err.message) || err) },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return handle(request);
}

// Vercel Cron memanggil pakai GET.
export async function GET(request) {
  return handle(request);
}
