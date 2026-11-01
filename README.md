# MIA 2026 · WIA — Competitor Tracker (Next.js + Supabase + Vercel)

Scrape repo GitHub kompetisi **MIA 2026 / Web In Action (WIA)**, simpan di **Supabase**, tampilkan di dashboard brutalist, deploy di **Vercel**.

---

## Isi project

```
web/
├─ src/app/
│  ├─ page.js                  # halaman dashboard
│  ├─ layout.js
│  ├─ globals.css              # styling neo-brutalist
│  └─ api/
│     ├─ repos/route.js        # GET data repo + run terakhir
│     └─ refresh/route.js      # POST/GET jalankan scraping
├─ src/components/Dashboard.js # UI client component
├─ src/lib/
│  ├─ config.js                # QUERIES, SINCE, filter
│  ├─ github.js                # GitHub API + retry
│  ├─ scrape.js                # orkestrasi scrape -> Supabase
│  └─ supabase.js              # client service-role (server only)
├─ supabase/schema.sql         # tabel + index + RLS
├─ vercel.json                 # cron harian (Hobby-safe)
└─ .github/workflows/refresh.yml  # alternatif cron 3 jam (gratis)
```

---

## 1. Setup Supabase

1. Buka [supabase.com](https://supabase.com) → **New project** (pilih region terdekat, mis. Singapore).
2. Tunggu project selesai provisioning.
3. Buka **SQL Editor** → **New query** → paste isi **`supabase/schema.sql`** → **Run**.
4. Buka **Project Settings → API**, catat:
   - **Project URL** → jadi `SUPABASE_URL`
   - **service_role** key (bukan anon!) → jadi `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ **service_role key itu rahasia.** Jangan pernah taruh di kode client / `NEXT_PUBLIC_*`.
> Project ini cuma memakainya di server (API routes), jadi aman.

---

## 2. GitHub Token

1. [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**
2. Scope: **kosongkan semua** (cukup baca data publik)
3. Salin `ghp_...` → jadi `GITHUB_TOKEN`

---

## 3. Jalanin lokal

```bash
cd web
cp .env.example .env.local     # Windows: copy .env.example .env.local
# isi .env.local:
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   GITHUB_TOKEN=...
npm install
npm run dev
```

Buka http://localhost:3000 → klik **Refresh Scan** untuk scraping pertama.

---

## 4. Deploy ke Vercel

1. Push folder `web/` ke repo GitHub (atau `vercel` CLI langsung).
2. [vercel.com/new](https://vercel.com/new) → import repo.
3. **Root Directory**: `web` (kalau repo-nya isinya folder ini).
4. **Environment Variables** — tambahkan:
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://xxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` |
   | `GITHUB_TOKEN` | `ghp_...` |
   | `CRON_SECRET` | *(opsional)* string random panjang |
   | `NEXT_PUBLIC_ALLOW_REFRESH` | `true` |
5. **Deploy**.
6. Buka URL → klik **Refresh Scan**.

---

## 5. Auto-refresh

### Opsi A — Vercel Cron (paling gampang, tapi…)
`vercel.json` sudah set cron **harian** (`0 0 * * *`) karena **Vercel Hobby cuma boleh 1x/hari**.
Kalau punya Vercel Pro, ganti jadi tiap 3 jam:

```json
{ "crons": [{ "path": "/api/refresh", "schedule": "0 */3 * * *" }] }
```

> Vercel Cron otomatis kirim `Authorization: Bearer $CRON_SECRET` kalau `CRON_SECRET` di-set.

### Opsi B — GitHub Actions (gratis, tiap 3 jam) ← recommended
Workflow `.github/workflows/refresh.yml` sudah disiapkan.

1. Repo GitHub → **Settings → Secrets and variables → Actions**
2. Tambah 2 secrets:
   - `APP_URL` = `https://project-kamu.vercel.app`
   - `CRON_SECRET` = sama persis dengan env di Vercel
3. Selesai — jalan tiap 3 jam (dan bisa manual via **Run workflow**).

> Kalau pakai Opsi B, hapus `crons` di `vercel.json` biar nggak dobel.

---

## Konfigurasi scraping

Edit **`src/lib/config.js`**:

| Opsi | Default | Fungsi |
|---|---|---|
| `QUERIES` | 4 query (`"mia 2026"`, `"wia 2026"`, dll) | Keyword. Kutip = exact phrase |
| `SINCE` | `2026-10-10` | Cuma repo **dibuat** sejak tanggal ini. `''` = semua |
| `NAME_FILTER_SRC` | regex anti-noise | Buang `miami`/`MIAX`/`Miage` |
| `MAX_ENRICH` | `30` | Batas repo yang di-detail per run (jaga limit 60 detik Vercel) |
| `MIN_MINUTES_BETWEEN_RUNS` | `5` | Cooldown tombol refresh |

---

## API

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/repos` | GET | Semua repo + run terakhir |
| `/api/refresh` | POST / GET | Jalankan scrape. `?force=1` bypass cooldown |

Kalau `CRON_SECRET` di-set, `/api/refresh` butuh header:
```
Authorization: Bearer <CRON_SECRET>
```

---

## Cara kerja scraping

1. **Search** tiap query ke GitHub Search API (`created:>=2026-10-10`), max 2 halaman × 100.
2. **Filter** noise pakai regex.
3. **Dedupe** by `full_name`, gabung `matched_queries`.
4. **Enrich** (cuma repo baru / `pushed_at` berubah / README kosong):
   - detail repo → homepage
   - jumlah commit (dari header `Link` rel="last")
   - bahasa + persentase
   - preview README (raw)
5. **Upsert** ke Supabase, tandai `is_new` buat repo yang baru muncul.
6. **Log** ke tabel `runs`.

Data lama dipakai ulang kalau `pushed_at` nggak berubah → hemat kuota API.

---

## Troubleshooting

**`SUPABASE_URL ... belum di-set`**
→ `.env.local` belum kebaca. Restart `npm run dev` setelah edit env.

**`relation "public.repositories" does not exist`**
→ `schema.sql` belum dijalankan di Supabase.

**`GitHub search 403: rate limit`**
→ Token salah/kosong, atau kuota habis. Cek `GITHUB_TOKEN` di env.

**Refresh balik `{ skipped: true }`**
→ Cooldown 5 menit. Tambah `?force=1` atau tunggu.

**Data kosong padahal scan OK**
→ Cek `SUPABASE_SERVICE_ROLE_KEY` pakai **service_role**, bukan anon.
   RLS aktif tanpa policy → anon key nggak bisa baca/tulis.

**Vercel function timeout**
→ Turunkan `MAX_ENRICH` di `config.js`, atau upgrade plan.

---

## Catatan keamanan

- Browser **tidak pernah** memegang key Supabase; semua lewat API route server.
- `GITHUB_TOKEN` juga server-side.
- Kalau dashboard publik dan kamu nggak mau orang bisa trigger refresh:
  set `CRON_SECRET`, lalu set `NEXT_PUBLIC_ALLOW_REFRESH=false`.
  Refresh cuma bisa dari cron / curl dengan secret.
