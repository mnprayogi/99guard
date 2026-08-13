# PRD — e-Patroli (Security Guard System)

## 1. Ringkasan

Sistem e-Patroli berbasis web (PWA) untuk memantau aktivitas patroli satpam secara real-time:

- **Satpam** melakukan check-in di titik patroli dengan **scan QR + foto lokasi (wajib) + GPS**, dan melaporkan insiden.
- **Admin (Kepala Satpam)** mengatur ronde, memantau patroli live, mengelola insiden, dan melihat rekap/kepatuhan.
- **Superadmin** mengelola pengguna, lokasi (multi-site), titik patroli, dan seluruh data.

Biaya pengembangan & operasional: **Rp 0** (Supabase Free Tier + Vercel/Netlify).

---

## 2. Peran & Hak Akses

| Peran | Kemampuan | Batasan |
| --- | --- | --- |
| **Superadmin** | Kelola akun pengguna (buat/aktifkan/nonaktifkan satpam & admin), kelola site & titik patroli, generate QR, setting ronde, kelola insiden, lihat semua data & laporan semua site | Tidak ada |
| **Admin (Kepala Satpam)** | Setting ronde + assign satpam ke ronde, monitoring patroli live, rekap patroli & SLA, kelola status insiden, lihat data sesuai site-nya | Tidak bisa kelola pengguna & tidak bisa melihat site di luar cakupannya |
| **Satpam** | Scan QR check-in + foto + GPS, lapor insiden, lihat riwayat patroli sendiri, lihat ronde yang di-assign | Hanya data miliknya sendiri |

---

## 3. Konsep Domain

### 3.1 Site (Lokasi Gedung)
Sistem mendukung **multi-site**. Titik patroli dan satpam dikelompokkan per site. Admin filter data per site.

### 3.2 Checkpoint (Titik Patroli)
- Titik fisik yang wajib dikunjungi satpam, memiliki **QR code unik** (berisi ID checkpoint).
- Dikelompokkan dalam satu site, memiliki nama & deskripsi lokasi.

### 3.3 Ronde
- **Ronde = jendela waktu patroli harian** berisi daftar titik yang wajib discan semua dalam rentang waktu tersebut.
- Contoh: Ronde 1 (07:00–08:00) wajib scan semua titik di daftarnya; Ronde 2 (12:00–13:00); dst.
- Admin menentukan: nama ronde, jam mulai–selesai, daftar titik wajib, toleransi waktu per titik (mis. ±15 menit).
- **1 satpam dapat di-assign ke beberapa ronde** dalam sehari (relasi banyak-ke-banyak).
- Ronde dapat diaktifkan/nonaktifkan.

### 3.4 Kepatuhan (SLA)
- **Compliant**: semua titik dalam ronde ter-scan dalam jendela waktu.
- **Missed**: titik tanpa scan hingga ronde berakhir → sistem **auto-detect saat ronde berakhir** dan memberi notifikasi ke admin.
- **Late/Early**: scan terjadi di luar toleransi waktu titik tersebut.
- Metrik kepatuhan: % titik tepat waktu, % ronde compliant per satpam/per site.

---

## 4. Fitur Satpam (PWA Mobile)

1. **Login** email/password (Supabase Auth), session persistent.
2. **Daftar ronde aktif** yang di-assign hari ini + progres (berapa titik sudah discan).
3. **Scan QR check-in**:
   - Buka kamera → scan QR titik → validasi titik termasuk ronde aktif.
   - **Wajib ambil foto lokasi** (dikompres <150 KB di device, JPEG quality ~60–70%, max width 800px).
   - Capture **lokasi GPS** (lat/lng).
   - Catat `scanned_at`; data masuk `patrol_logs`.
4. **Mode offline**: jika tanpa sinyal, log + foto disimpan sementara di IndexedDB (Dexie.js), **sinkron otomatis** saat koneksi kembali (foto tetap wajib diambil sebelum submit).
5. **Lapor insiden**: kategori, deskripsi, foto, GPS.
6. **Riwayat patroli** sendiri (list scan per hari).

---

## 5. Fitur Admin (Kepala Satpam)

1. **Setting ronde**: buat/edit ronde (nama, jam mulai–selesai, daftar titik, toleransi), aktif/nonaktifkan, **assign satpam ke ronde**.
2. **Monitoring live**: daftar patroli berjalan saat ini (satpam, titik, waktu, foto), peringatan missed/terlambat — via **Supabase Realtime** tanpa refresh.
3. **Kelola insiden**: lihat notifikasi insiden baru, ubah status `open → in_progress → resolved`, catat aksi/tindak lanjut.
4. **Rekap patroli**: harian/mingguan per satpam, per ronde, per titik.
5. **Kepatuhan SLA**: % titik tepat waktu, % ronde compliant.
6. **Statistik insiden**: per kategori, tren, waktu response.

---

## 6. Fitur Superadmin

Semua fitur Admin, ditambah:
1. **Kelola pengguna**: buat akun satpam/admin, ubah role, aktifkan/nonaktifkan.
2. **Kelola site**: tambah/edit lokasi gedung.
3. **Kelola checkpoint**: tambah/edit titik patroli + **generate & cetak QR code** tiap titik.
4. Akses penuh semua site & semua laporan.

---

## 7. Alur Utama

### 7.1 Alur Check-in
```text
[Satpam] Login
  → Lihat ronde aktif hari ini
  → Buka kamera, scan QR titik
  → Validasi titik ∈ ronde aktif
  → Foto lokasi (wajib, kompres <150KB) + GPS
  → Simpan patrol_logs (+ foto ke Storage)
       ├─ Online: kirim langsung → Realtime push ke Admin
       └─ Offline: simpan ke IndexedDB → sync otomatis saat online
```

### 7.2 Alur Insiden
```text
[Satpam] Pilih kategori → deskripsi → foto → GPS
  → Insert incidents (+ incident_photos)
  → Notifikasi realtime ke Admin
[Admin] Lihat detail (foto, lokasi, waktu)
  → Ubah status open → in_progress → resolved
  → Catat incident_actions (tindak lanjut)
```

### 7.3 Deteksi Missed Ronde
```text
Saat ronde berakhir (end_time tercapai):
  → Hitung checkpoint ∈ ronde tanpa patrol_logs valid
  → Insert/update status missed → notifikasi ke Admin
```

---

## 8. Data Model (Supabase / PostgreSQL)

| Tabel | Kolom utama | Catatan |
| --- | --- | --- |
| `profiles` | id (FK auth.users), full_name, role (`superadmin`/`admin`/`satpam`), site_id, active | dibuat otomatis saat signup/oleh superadmin |
| `sites` | id, name, address, created_at | lokasi gedung |
| `checkpoints` | id, site_id, name, description, qr_code (unique), lat, lng, active | QR berisi ID checkpoint |
| `rounds` | id, site_id, name, start_time, end_time, tolerance_minutes, active | jendela waktu harian |
| `round_checkpoints` | id, round_id, checkpoint_id, order_index | titik wajib per ronde |
| `round_assignments` | id, round_id, guard_id (profiles), date, status | 1 satpam → banyak ronde |
| `patrol_logs` | id, round_id, checkpoint_id, guard_id, scanned_at, lat, lng, photo_url, is_synced | check-in satpam |
| `incidents` | id, site_id, guard_id, category, description, lat, lng, status, reported_at | status: open/in_progress/resolved |
| `incident_photos` | id, incident_id, photo_url | |
| `incident_actions` | id, incident_id, admin_id, action, created_at | tindak lanjut |

**Keamanan**: Row Level Security (RLS) — satpam hanya baca/tulis datanya sendiri; admin sesuai site-nya; superadmin penuh.
**Realtime**: subscribe ke `patrol_logs` & `incidents` untuk monitoring live & notifikasi.
**Storage**: bucket `photos` (1 GB free tier) untuk foto check-in & insiden.

---

## 9. Non-Functional Requirements

- **PWA installable** (manifest + service worker), offline-first di sisi satpam.
- Foto dikompres di client **sebelum** dikirim (≤150 KB).
- Scan QR via kamera browser (`@zxing/library`).
- Sinkronisasi otomatis antrean offline (Dexie/IndexedDB).
- Keamanan data level database (RLS), audit trail (siapa-siapa-scan-kapan).
- Responsif: UI ramah jempol di HP satpam, tabel/dashboard di desktop admin.

---

## 10. Tech Stack

### 10.1 Frontend & Mobile (Satu Codebase React)

* **Framework:** React (via Vite) — ringan & cepat, PWA kecil untuk HP satpam.
* **Bahasa:** TypeScript — type safety dari skema Supabase hingga UI.
* **PWA:** `vite-plugin-pwa` — service worker, caching offline, install to home screen.
* **Styling & UI:** Tailwind CSS + Shadcn/ui — tombol besar ramah jempol (satpam) & komponen tabel/modal/form (dashboard admin).
* **Scan QR:** `@zxing/library` — stabil, akses kamera lewat browser/PWA.
* **Kompresi gambar:** `browser-image-compression` — <150 KB (JPEG ~60–70%, max width 800px) di device sebelum upload.
* **Offline storage:** `Dexie.js` (IndexedDB) — log scan & foto sementara, sinkron otomatis saat online.

### 10.2 Backend & Database (Supabase Free Tier)

* **Database:** PostgreSQL (500 MB) — seluruh data di atas.
* **Auth:** Supabase Auth — login email/password, session management.
* **Storage:** Supabase Storage (1 GB bucket) — foto check-in & insiden.
* **Realtime:** Supabase Realtime (Postgres Changes) — push log patroli & insiden ke dashboard tanpa polling.
* **Security:** PostgreSQL Row Level Security (RLS) per role.

### 10.3 Deployment & Infrastruktur (Full Gratis)

| Komponen | Platform | Alasan |
| --- | --- | --- |
| Hosting Frontend | Vercel / Netlify | Unlimited bandwidth, SSL otomatis (wajib untuk kamera HP & PWA), CI/CD dari GitHub |
| Backend & Database | Supabase Free Tier | 500 MB DB + 1 GB Storage + Realtime |
| Repository | GitHub | Privat gratis |

---

## 11. Alur Kerja Tech Stack

```text
[ HP Satpam / PWA ]
  ├── React (Vite) + Tailwind CSS
  ├── @zxing/library (Scan QR)
  ├── browser-image-compression (Kompres <150KB)
  ├── Geolocation (GPS check-in)
  └── Sync ke Supabase (Offline: simpan di Dexie/IndexedDB)
            │
            ▼ (HTTPS API / JS Client SDK)
[ Supabase Backend ]
  ├── Auth (Login Satpam, Admin, Superadmin)
  ├── PostgreSQL + RLS (Data Log Patroli)
  ├── Storage Bucket (Foto Terkompresi)
  └── Realtime Websocket
            │
            ▼ (Realtime Push Data)
[ Web Admin / Superadmin ]
  └── React (Vite) + Shadcn/ui + Supabase Realtime Listener
```