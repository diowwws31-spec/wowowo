// Semua komunikasi ke GitHub API ada di sini.

const API = 'https://api.github.com';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch GitHub dengan retry + backoff kalau kena rate limit / server sibuk.
 * Mengembalikan Response (status 200 atau status final yang perlu ditangani pemanggil).
 */
export async function githubFetch(url, accept) {
  const token = process.env.GITHUB_TOKEN;
  const maxTries = 4;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: {
          Accept: accept || 'application/vnd.github+json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'mia-wia-tracker',
        },
        cache: 'no-store',
      });
    } catch (e) {
      if (attempt === maxTries) throw e;
      await sleep(1000 * attempt);
      continue;
    }

    if (res.status === 200) return res;

    if (res.status === 403 || res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const reset = res.headers.get('x-ratelimit-reset');
      let waitMs = retryAfter ? Number(retryAfter) * 1000 : 0;
      if (!waitMs && reset) waitMs = Math.max(Number(reset) * 1000 - Date.now(), 1000);
      if (!waitMs) waitMs = 1500 * attempt;
      if (attempt === maxTries) return res;
      await sleep(Math.min(waitMs, 8000));
      continue;
    }

    if (res.status >= 500) {
      if (attempt === maxTries) return res;
      await sleep(1000 * attempt);
      continue;
    }

    return res; // 404 dll — biar pemanggil yang putuskan
  }

  throw new Error('GitHub API gagal setelah beberapa percobaan.');
}

/** Cari repo untuk satu query, dengan pagination. */
export async function searchRepos(query, config) {
  const qualifiers = [];
  if (config.SINCE) qualifiers.push(`created:>=${config.SINCE}`);
  const q = [query, ...qualifiers].join(' ');

  const items = [];
  let total = 0;
  let calls = 0;

  for (let page = 1; page <= config.MAX_PAGES; page++) {
    const url =
      `${API}/search/repositories?q=${encodeURIComponent(q)}` +
      `&sort=${config.SORT}&order=${config.ORDER}` +
      `&per_page=${config.PER_PAGE}&page=${page}`;

    const res = await githubFetch(url);
    calls++;
    if (res.status !== 200) {
      const text = await res.text();
      throw new Error(`GitHub search ${res.status}: ${text.slice(0, 200)}`);
    }

    const body = await res.json();
    total = body.total_count || 0;
    const batch = body.items || [];
    items.push(...batch);
    if (batch.length < config.PER_PAGE) break;

    await sleep(300);
  }

  return { items, total, calls };
}

/** Ambil detail tambahan satu repo. Balikin jumlah API call yang dipakai. */
export async function enrichRepo(repo) {
  let calls = 0;
  const base = `${API}/repos/${repo.full_name}`;

  // 1) Detail repo -> homepage
  const detail = await githubFetch(base);
  calls++;
  if (detail.status === 200) {
    const d = await detail.json();
    repo.homepage = d.homepage || '';
    repo.default_branch = d.default_branch || repo.default_branch || '';
    if (!repo.topics && d.topics) repo.topics = d.topics.join(', ');
  }

  // 2) Jumlah commit dari header Link rel="last"
  const commits = await githubFetch(`${base}/commits?per_page=1`);
  calls++;
  if (commits.status === 200) {
    const last = parseLastPage(commits.headers.get('link') || '');
    if (last !== null) {
      repo.commit_count = last;
    } else {
      const arr = await commits.json();
      repo.commit_count = Array.isArray(arr) ? arr.length : 0;
    }
  } else if (commits.status === 409) {
    repo.commit_count = 0; // repo kosong
  }

  // 3) Bahasa + persentase
  const langs = await githubFetch(`${base}/languages`);
  calls++;
  if (langs.status === 200) {
    repo.languages_list = formatLanguages(await langs.json());
  }

  // 4) README (raw text)
  const readme = await githubFetch(`${base}/readme`, 'application/vnd.github.raw+json');
  calls++;
  if (readme.status === 200) {
    repo.readme_preview = previewText(await readme.text(), 900);
  }

  return calls;
}

/** Dari header Link GitHub, ambil page rel="last" (= total commit). */
export function parseLastPage(linkHeader) {
  if (!linkHeader) return null;
  const m = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(linkHeader);
  return m ? Number(m[1]) : null;
}

export function formatLanguages(langObj) {
  const names = Object.keys(langObj || {});
  if (!names.length) return '';
  const total = names.reduce((sum, n) => sum + langObj[n], 0) || 1;
  return names
    .sort((a, b) => langObj[b] - langObj[a])
    .slice(0, 5)
    .map((n) => `${n} ${Math.round((langObj[n] / total) * 100)}%`)
    .join(', ');
}

export function previewText(text, max) {
  if (!text) return '';
  let t = String(text).replace(/\r/g, '').replace(/[#*`>_\-]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}
