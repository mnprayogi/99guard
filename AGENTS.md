# 99Guard — Konteks Proyek (untuk opencode)

e-Patroli Security System: PWA satpam + web admin (Vite + React + TS + Tailwind + Supabase).

## Infra
- Prod: `https://99guard.vercel.app` (Vercel Hobby, CI/CD dari git push)
- Repo: `https://github.com/mnprayogi/99guard` (publik)
- Supabase ref: `mokawkubuehorhedepkn` — URL `https://mokawkubuehorhedepkn.supabase.co`
- Kunci ada di `.env` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN) — jangan commit. Kredensial akun: `.local/creds.md` (gitignored).

## Aturan penting
- Semua commit harus ber-author `mnprayogi` (syarat deploy Vercel Hobby). Jika author berubah, amend+rebase atau Vercel menolak deploy.
- Vercel env `VITE_SUPABASE_ANON_KEY` memakai legacy JWT anon (eyJ...), lokal pakai `sb_publishable_...` — keduanya valid.
- Supabase Management API `PATCH config/auth`: `uri_allow_list` HARUS comma-separated string (`url1,url2`), bukan JSON array (JSON bikin GoTrue 503 di semua endpoint).
- `sessions_timebox` = Pro-only (402 di free tier).
- Build: `npm run lint && npm run build`. Output: precache ~25 entries.

## Arsitektur
- `src/pages/guard/` — GuardHome, ScanPage, IncidentForm (alur satpam)
- `src/pages/admin/` — Dashboard, RoundsPage, CheckpointsPage, UsersPage, IncidentsPage, ReportsPage, StoragePage
- `src/lib/photo.ts` — kompresi/upload/kamera. **Kamera foto: `openCamera()` (getUserMedia) → `captureVideoFrame()` (canvas). WAJIB: video element selalu ada di DOM (hidden) saat getUserMedia dipanggil — jika element conditional-render, `videoRef` null → TypeError "setting srcObject"** (bug yang sudah diperbaiki).
- `src/lib/debugLog.ts` — `logClient(page, step, message, meta?)`: insert langsung ke `client_logs` via REST, fallback edge fn `log-client` (deploy via MCP perlu `import_map_path: "deno.json"` saat redeploy).
- `src/lib/types.ts` — `Database` interface manual (tabel baru harus ditambah di sini agar TS lulus).
- PWA: `vite.config.ts` `registerType: 'autoUpdate'`.

## Status yang sudah selesai (2026-08-14)
- Deploy live, auth redirect OK (comma-separated uri_allow_list), login/rest/storage tervalidasi.
- Foto HP: akar masalah = bundle lama di SW cache + `capture="environment"` me-recycle halaman Android + videoRef null. Fix final: foto dari stream kamera langsung (anti-manipulasi, full screen overlay), fallback `capture` sistem hanya jika getUserMedia ditolak. Galeri tidak dipakai.
- Ronde GuardHome: status Selesai & badge hijau dihitung per-ronde dari `round_id` cocok ATAU `scanned_at` dalam jam ronde (bukan scan global hari ini).
- Observability: tabel `client_logs` (RLS insert own) + edge fn `log-client` v2 + log di GuardHome/ScanPage/IncidentForm.
- Password superadmin di-reset via `update auth.users set encrypted_password = crypt(...)` (lihat `.local/creds.md`).

## Belum selesai / TODO
- Tombol "Lupa Kata Sandi?" di `src/pages/Login.tsx` (baris ~142) belum punya handler (forgot password via email belum ada).
- Lapor Insiden + foto belum diverifikasi penuh di HP produksi.
- `supabase_get_advisors` belum dicek (security/performance).

## Akun penting (email; password di .local/creds.md)
- superadmin: `superadmin@99guard.app`
- admin: `admin.test@99guard.app`
- satpam (id `414f6ed5-b406-492a-b453-98ffb313c44f`): `helmi` — email lihat creds. Rounds: Pagi 07–08, Siang 12–13, Malam 20–23 (2026-08-13).
