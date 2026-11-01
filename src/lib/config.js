// Konfigurasi pencarian. Ubah di sini kalau mau ganti keyword / tanggal.
export const CONFIG = {
  // Pakai tanda kutip = exact phrase (paling bersih).
  QUERIES: ['"mia 2026"', '"wia 2026"', '"web in action" 2026', '"web in action" mia'],

  // Lomba mulai ~10 Okt 2026. Kosongkan '' buat ambil semua.
  SINCE: '2026-10-10',

  // Regex buang noise (miami, MIAX, Miage). Kosongkan '' buat matiin.
  NAME_FILTER_SRC: '\\bmia\\b|\\bwia\\b|web.?in.?action|mia2026|wia2026',

  SORT: 'updated', // updated | stars | created
  ORDER: 'desc',
  PER_PAGE: 100,
  MAX_PAGES: 2,

  // Enrich = detail repo, jumlah commit, bahasa, README.
  // Dibatasi biar aman di batas waktu Vercel (60 detik di Hobby).
  MAX_ENRICH: 30,

  // Jeda minimum antar scan (menit) — biar tombol refresh nggak bisa dispam.
  MIN_MINUTES_BETWEEN_RUNS: 5,
};

export const NAME_FILTER_RE = new RegExp(CONFIG.NAME_FILTER_SRC, 'i');

export function matchesFilter(item) {
  const hay = [item.full_name, item.description || '', (item.topics || []).join(' ')].join(' ');
  return NAME_FILTER_RE.test(hay);
}
