import { supabaseAdmin } from './supabase';
import { CONFIG, matchesFilter } from './config';
import { searchRepos, enrichRepo, sleep } from './github';

/** Field yang boleh masuk DB (biar Set/objek internal nggak ikut ke-upsert). */
const ROW_FIELDS = [
  'full_name', 'html_url', 'description', 'owner', 'owner_type',
  'stars', 'forks', 'watchers', 'open_issues',
  'language', 'topics', 'license', 'homepage', 'default_branch',
  'commit_count', 'languages_list', 'readme_preview', 'matched_queries',
  'created_at', 'updated_at', 'pushed_at',
  'first_seen_at', 'last_seen_at', 'is_new',
];

function dateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function mapItem(item, query) {
  const owner = item.owner || {};
  return {
    full_name: item.full_name,
    html_url: item.html_url,
    description: item.description || '',
    owner: owner.login || '',
    owner_type: owner.type || '',
    stars: item.stargazers_count || 0,
    forks: item.forks_count || 0,
    watchers: item.watchers_count || 0,
    open_issues: item.open_issues_count || 0,
    language: item.language || '',
    topics: (item.topics || []).join(', '),
    license: (item.license && item.license.spdx_id) || '',
    homepage: '',
    default_branch: item.default_branch || '',
    commit_count: null,
    languages_list: '',
    readme_preview: '',
    created_at: dateOnly(item.created_at),
    updated_at: dateOnly(item.updated_at),
    pushed_at: dateOnly(item.pushed_at),
    queries: new Set([query]),
  };
}

function toRow(repo, existing, now) {
  const isNew = !existing;
  const row = {};
  for (const field of ROW_FIELDS) row[field] = repo[field];
  row.matched_queries = Array.from(repo.queries || []).join('; ');
  row.first_seen_at = existing ? existing.first_seen_at : now;
  row.last_seen_at = now;
  row.is_new = isNew;
  return row;
}

/**
 * Jalankan scraping penuh: search -> dedupe -> filter -> enrich -> upsert -> log.
 */
export async function runScrape({ force = false } = {}) {
  const started = new Date();
  const db = supabaseAdmin();

  // --- cooldown biar endpoint nggak bisa dispam ---
  if (!force) {
    const { data: last } = await db
      .from('runs')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1);

    if (last && last.length) {
      const minutes = (Date.now() - new Date(last[0].started_at).getTime()) / 60000;
      if (minutes < CONFIG.MIN_MINUTES_BETWEEN_RUNS) {
        return {
          skipped: true,
          reason: `Baru saja scan ${Math.round(minutes)} menit lalu. Tunggu sebentar.`,
        };
      }
    }
  }

  try {
    // --- data lama buat dedupe & cache enrich ---
    const { data: existingRows, error: existingErr } = await db
      .from('repositories')
      .select('*');
    if (existingErr) throw new Error(existingErr.message);

    const existing = Object.fromEntries((existingRows || []).map((r) => [r.full_name, r]));

    // --- search semua query ---
    let apiCalls = 0;
    const merged = new Map();

    for (const query of CONFIG.QUERIES) {
      const { items, calls } = await searchRepos(query, CONFIG);
      apiCalls += calls;

      for (const item of items) {
        if (!matchesFilter(item)) continue;
        if (merged.has(item.full_name)) {
          merged.get(item.full_name).queries.add(query);
        } else {
          merged.set(item.full_name, mapItem(item, query));
        }
      }

      await sleep(500);
    }

    // --- enrich detail (cuma yang baru / berubah / belum punya README) ---
    let enriched = 0;
    for (const repo of merged.values()) {
      const old = existing[repo.full_name];
      const changed = !old || existing[repo.full_name].pushed_at !== repo.pushed_at;
      const needs = changed || !old.readme_preview;

      if (!needs) {
        repo.homepage = old.homepage || '';
        repo.commit_count = old.commit_count;
        repo.languages_list = old.languages_list || '';
        repo.readme_preview = old.readme_preview || '';
        continue;
      }

      if (enriched >= CONFIG.MAX_ENRICH) continue; // sisanya di run berikutnya

      apiCalls += await enrichRepo(repo);
      enriched++;
      await sleep(60);
    }

    // --- susun baris final ---
    const now = new Date().toISOString();
    const rows = Array.from(merged.values()).map((repo) => toRow(repo, existing[repo.full_name], now));
    const newCount = rows.filter((r) => r.is_new).length;

    // --- reset badge "baru" run sebelumnya ---
    await db.from('repositories').update({ is_new: false }).gte('id', 0);

    // --- upsert ---
    if (rows.length) {
      const { error } = await db
        .from('repositories')
        .upsert(rows, { onConflict: 'full_name' });
      if (error) throw new Error(error.message);
    }

    // --- log run ---
    await db.from('runs').insert({
      started_at: started.toISOString(),
      status: 'OK',
      repos_total: rows.length,
      new_count: newCount,
      enriched,
      api_calls: apiCalls,
      message: `${CONFIG.QUERIES.length} query`,
    });

    return {
      ok: true,
      total: rows.length,
      newCount,
      enriched,
      apiCalls,
      durationMs: Date.now() - started.getTime(),
    };
  } catch (err) {
    const message = String((err && err.message) || err).slice(0, 400);
    try {
      await db.from('runs').insert({
        started_at: started.toISOString(),
        status: 'ERROR',
        repos_total: 0,
        new_count: 0,
        enriched: 0,
        api_calls: 0,
        message,
      });
    } catch (e) {
      // diamkan: kalau DB juga error, jangan nutupin error asli
    }
    throw err;
  }
}
