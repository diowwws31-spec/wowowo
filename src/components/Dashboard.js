'use client';

import { useEffect, useMemo, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ALLOW_REFRESH = process.env.NEXT_PUBLIC_ALLOW_REFRESH !== 'false';

function str(v) {
  return v == null ? '' : String(v);
}

function fmtDate(v) {
  if (!v) return '—';
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return str(v);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtNum(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('id-ID');
}

export default function Dashboard() {
  const [data, setData] = useState({ repos: [], lastRun: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const [sortKey, setSortKey] = useState('updated');
  const [onlyNew, setOnlyNew] = useState(false);
  const [open, setOpen] = useState(() => new Set());

  async function load() {
    try {
      const res = await fetch('/api/repos', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memuat data.');
      setData({ repos: json.repos || [], lastRun: json.lastRun || null });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Scan gagal.');

      if (json.skipped) {
        setNotice(json.reason || 'Scan dilewati (cooldown).');
      } else {
        setNotice(`Scan selesai: ${json.total} repo, ${json.newCount} baru, ${json.enriched} di-enrich.`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  const repos = data.repos;
  const lastRun = data.lastRun;

  const stats = useMemo(() => {
    const totalStars = repos.reduce((s, r) => s + (Number(r.stars) || 0), 0);
    const newCount = repos.filter((r) => r.is_new).length;
    const langCount = {};
    repos.forEach((r) => {
      if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
    });
    const topLang = Object.keys(langCount).sort((a, b) => langCount[b] - langCount[a])[0] || '—';
    return { totalStars, newCount, topLang };
  }, [repos]);

  const languages = useMemo(() => {
    const set = new Set();
    repos.forEach((r) => { if (r.language) set.add(r.language); });
    return Array.from(set).sort();
  }, [repos]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    const list = repos.filter((r) => {
      if (onlyNew && !r.is_new) return false;
      if (lang && r.language !== lang) return false;
      if (needle) {
        const hay = `${r.full_name} ${r.description || ''} ${r.owner || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const cmp = {
      updated: (a, b) => str(b.updated_at).localeCompare(str(a.updated_at)),
      created: (a, b) => str(b.created_at).localeCompare(str(a.created_at)),
      stars: (a, b) => (Number(b.stars) || 0) - (Number(a.stars) || 0),
      commits: (a, b) => (Number(b.commit_count) || 0) - (Number(a.commit_count) || 0),
      name: (a, b) => str(a.full_name).localeCompare(str(b.full_name)),
      forks: (a, b) => (Number(b.forks) || 0) - (Number(a.forks) || 0),
    }[sortKey] || (() => 0);

    return list.sort(cmp);
  }, [repos, q, lang, sortKey, onlyNew]);

  function toggleRow(name) {
    const next = new Set(open);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setOpen(next);
  }

  function sortBy(key) {
    setSortKey(key);
  }

  const columns = [
    { key: 'name', label: 'Repository', align: 'left' },
    { key: 'stars', label: 'Stars', align: 'right' },
    { key: 'forks', label: 'Forks', align: 'right' },
    { key: 'commits', label: 'Commits', align: 'right' },
    { key: null, label: 'Bahasa' },
    { key: 'created', label: 'Dibuat' },
    { key: 'updated', label: 'Update' },
    { key: null, label: 'Web' },
  ];

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <span className="eyebrow">MIA 2026 · WEB IN ACTION</span>
          <h1>
            Competitor<br /><span className="mark">Tracker</span>
          </h1>
        </div>
        <div className="top-right">
          <div className="meta">
            {lastRun
              ? (
                <>
                  SCAN TERAKHIR <b>{fmtDateTime(lastRun.started_at)}</b><br />
                  {lastRun.repos_total} REPO · {lastRun.new_count} BARU · {lastRun.api_calls} API CALL
                  {lastRun.enriched ? ` · ${lastRun.enriched} ENRICH` : ''}
                </>
              )
              : 'BELUM PERNAH SCAN'}
          </div>
          {ALLOW_REFRESH && (
            <button className="btn" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Scanning…' : 'Refresh Scan'}
            </button>
          )}
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <div className="tick">TOTAL</div>
          <div className="num">{repos.length}</div>
          <div className="lbl">Repo kompetitor terlacak</div>
        </div>
        <div className="stat">
          <div className="tick">SCAN</div>
          <div className="num">{stats.newCount}</div>
          <div className="lbl">Baru muncul di scan terakhir</div>
        </div>
        <div className="stat">
          <div className="tick">STARS</div>
          <div className="num">{stats.totalStars.toLocaleString('id-ID')}</div>
          <div className="lbl">Akumulasi bintang</div>
        </div>
        <div className="stat">
          <div className="tick">STACK</div>
          <div className="num" style={{ fontSize: 'clamp(18px,2.4vw,30px)' }}>{stats.topLang}</div>
          <div className="lbl">Bahasa paling dipakai</div>
        </div>
      </section>

      <section className="controls">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="search">Cari</label>
          <input
            id="search"
            type="text"
            placeholder="nama repo / deskripsi / owner…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="langFilter">Bahasa</label>
          <select id="langFilter" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="">SEMUA</option>
            {languages.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sortBy">Urutkan</label>
          <select id="sortBy" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="updated">UPDATE TERBARU</option>
            <option value="created">DIBUAT TERBARU</option>
            <option value="stars">PALING BANYAK BINTANG</option>
            <option value="commits">PALING BANYAK COMMIT</option>
            <option value="name">NAMA (A–Z)</option>
          </select>
        </div>
        <label className={`check${onlyNew ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={onlyNew}
            onChange={(e) => setOnlyNew(e.target.checked)}
          /> HANYA YANG BARU
        </label>
      </section>

      {notice && <div className="notice">{notice}</div>}

      {error && <div className="status error">GAGAL MEMUAT — {error}</div>}

      {loading && !error && <div className="status">Memuat data dari Supabase…</div>}

      {!loading && !error && (
        <div className="table-shell">
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.label}
                      className={c.key && sortKey === c.key ? 'sorted' : ''}
                      style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                      onClick={c.key ? () => sortBy(c.key) : undefined}
                    >
                      {c.label}
                      {c.key && sortKey === c.key && (
                        <span className="ind">{c.key === 'name' ? 'ASC' : 'DESC'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!filtered.length && (
                  <tr>
                    <td colSpan={8} className="status" style={{ border: 'none', boxShadow: 'none' }}>
                      {repos.length === 0
                        ? 'Belum ada data. Klik "Refresh Scan" buat scraping pertama.'
                        : 'Tidak ada repo yang cocok.'}
                    </td>
                  </tr>
                )}

                {filtered.map((r) => {
                  const isOpen = open.has(r.full_name);
                  const stars = Number(r.stars) || 0;
                  const home = r.homepage && /^https?:\/\//.test(r.homepage);
                  const tags = (r.topics || '').split(',').map((t) => t.trim()).filter(Boolean);

                  return (
                    <FragmentRow key={r.full_name}>
                      <tr className={`row${isOpen ? ' open' : ''}`} onClick={() => toggleRow(r.full_name)}>
                        <td className="cell-name">
                          <div className="name">
                            <a
                              href={r.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.full_name}
                            </a>
                            {r.is_new && <span className="pill new" style={{ marginLeft: 7 }}>Baru</span>}
                          </div>
                          <div className="desc">{r.description || 'deskripsi kosong'}</div>
                        </td>
                        <td className="num">
                          {stars ? <span className="pill star">{fmtNum(stars)}</span> : <span className="dim">0</span>}
                        </td>
                        <td className="num">{fmtNum(r.forks)}</td>
                        <td className="num">{fmtNum(r.commit_count)}</td>
                        <td>
                          {r.language
                            ? <span className="pill lang">{r.language}</span>
                            : <span className="pill none">N/A</span>}
                        </td>
                        <td><span className="dim">{fmtDate(r.created_at)}</span></td>
                        <td><span className="dim">{fmtDate(r.updated_at)}</span></td>
                        <td>
                          {home
                            ? <a href={r.homepage} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>BUKA</a>
                            : <span className="dim">—</span>}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="detail">
                          <td colSpan={8}>
                            <div className="dgrid">
                              <DField k="Owner" v={r.owner || '—'} />
                              <DField k="Stack rincian" v={r.languages_list || '—'} />
                              <DField k="Lisensi" v={r.license || '—'} />
                              <DField k="Push terakhir" v={r.pushed_at ? fmtDate(r.pushed_at) : '—'} />
                              <DField k="Commit" v={r.commit_count != null ? fmtNum(r.commit_count) : '—'} />
                              <DField k="Ketemu via query" v={r.matched_queries || '—'} />
                            </div>

                            {tags.length > 0 && (
                              <div className="tags">
                                {tags.map((t) => <span className="tag" key={t}>{t}</span>)}
                              </div>
                            )}

                            <div className="readme-h">README — preview</div>
                            <div className="readme">{r.readme_preview || '(README tidak ditemukan)'}</div>
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <footer className="foot">
        <span>MENAMPILKAN {filtered.length} DARI {repos.length} REPO</span>
        <span>SUMBER: GITHUB API · SUPABASE · AUTO-REFRESH</span>
      </footer>
    </div>
  );
}

function DField({ k, v }) {
  return (
    <div className="dfield">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function FragmentRow({ children }) {
  return <>{children}</>;
}
