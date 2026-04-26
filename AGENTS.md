# AGENTS.md — Bot Input Data KJP di WA Otomatis

> Knowledge base untuk AI agent. Baca file ini PERTAMA sebelum explore codebase.
> Terakhir diupdate: 2026-04-26 (sesi: rename Foodstation konsisten)

---

## 1. Arsitektur

### Stack
- **Runtime**: Node.js + TypeScript (tsc → dist/)
- **Test runner**: Bun (`bun test --isolate`)
- **WhatsApp**: @whiskeysockets/baileys v7.0.0-rc.9
- **Database**: Supabase (PostgreSQL via @supabase/supabase-js)
- **Server**: Express (port 3000, health check only)
- **Deploy target**: STB server (192.168.100.104) via SCP + SSH + pm2

### Entry Points
```
src/index.ts          → Express server, startCsvContactsSync(), startSchedulePoller(), connectToWhatsApp()
src/wa.ts             → Core orchestrator (7500+ baris), semua message routing + admin/user handler
```

### File Map
```
src/
├── config/
│   └── messages.ts           # Semua template pesan, mapping lokasi, menu admin
├── services/
│   ├── adminLocationMenu.ts  # Handler menu kelola buka/tutup lokasi (9 state)
│   ├── csvContactsSync.ts    # Sync kontak dari CSV (fs.watchFile polling 60s)
│   ├── excelService.ts       # Export data ke XLSX
│   ├── ktpMasterLookup.ts    # Lookup data KTP dari CSV master
│   ├── locationGate.ts       # Gate logic: cek lokasi buka/tutup, provider-level + sub-location + jam operasional
│   ├── locationQuota.ts      # Kuota per-user per-lokasi (file-based)
│   ├── locationScheduler.ts  # Polling jadwal buka/tutup lokasi (setInterval 60s)
│   ├── statusCheckService.ts      # Cek status Dharmajaya (existing)
│   ├── pasarjayaStatusCheck.ts   # Cek status Pasarjaya (CSRF+cookie+HTML parse)
│   ├── foodStationStatusCheck.ts # Cek status Foodstation (POST+parse)
│   ├── statusCheckFormatter.ts   # Format output status per-provider (summary + failed copy)
│   ├── locationResolver.ts       # Fuzzy matching lokasi Pasarjaya (3-tahap substring search, 97 lokasi)
│   └── whitelistGate.ts          # Auth: cek nomor HP terdaftar di whitelist
├── data/
│   └── locations-pasarjaya.json  # 97 lokasi referensi Pasarjaya (5 wilayah, read-only)
├── sql/                      # DDL Supabase (reference only, jalankan manual)
│   ├── blocked_locations.sql # Tabel blocked_locations + kolom provider
│   ├── location_schedules.sql# Tabel location_schedules (jadwal buka/tutup)
│   ├── provider_operation_overrides.sql # Override jam operasional per-provider
│   ├── blocked_kjp.sql
│   ├── blocked_ktp.sql       # ALTER TABLE blocked_ktp + kolom block_type
│   ├── create_whitelisted_phones.sql
│   ├── global_location_quota_rpc.sql
│   └── location_quota_fresh.sql
├── tests/                    # 30 test files, excluded dari tsc build (parser: 131 tests)
│   ├── helpers.ts            # Mock factories (createMockSupabaseClient, createBlockedLocation, createSchedule)
│   ├── setup.ts              # NODE_ENV=test
│   └── *.test.ts             # Unit + integration tests
├── state.ts                  # State machine: UserFlowState, AdminFlowState, semua Map<phone, state>
├── supabase.ts               # Semua DB operations (CRUD blocked_locations, schedules, dll)
├── parser.ts                 # Parse input user → LogJson, checkBlockedLocationBatch, multi-field split
├── time.ts                   # WIB timezone utilities (getWibParts, isSystemClosed, dll)
├── types.ts                  # Shared type definitions
├── store.ts                  # Baileys store
├── contacts_data.ts          # Data kontak dari CSV
├── recap.ts                  # Rekap data harian
├── reply.ts                  # Reply message builder
└── utils/                    # Utility functions
```

---

## 2. Konvensi Kode

### State Machine Pattern
- `UserFlowState` dan `AdminFlowState` adalah **type union string literal** (BUKAN enum)
- State disimpan di `Map<string, State>` per nomor HP (singleton di state.ts)
- Handler di wa.ts: `switch/if-else` pada `currentAdminFlow` / `currentUserFlow`
- Navigasi: `0` = kembali ke menu sebelumnya (ada 0-escape prevention di wa.ts)
- State prefix grouping: `BLOCKED_LOCATION_*`, `LOCATION_MGMT_*`, `CONTACT_*`, `WHITELIST_*`, dll

### Supabase Pattern
- Semua DB call di `src/supabase.ts` (centralized)
- Error handling: `isMissingTableError()` check → console.error → return default value
- `closeLocation()` = upsert (insert or update `is_active: true`)
- `openLocation()` = soft-toggle (`is_active: false`), BUKAN delete row
- Provider-level: `closeLocationByProvider()`, `openLocationByProvider()`, `isProviderBlocked()`
- `checkBlockedLocationBatch()` cek exact key DAN provider-level key

### Blocked KTP System (2 Jenis)
- Tabel `blocked_ktp` punya kolom `block_type`: `'permanent'` atau `'temporary'` (default: `'temporary'`)
- **Permanen**: tidak pernah di-reset, terdeteksi tanpa filter tanggal. Pesan: "KTP tidak dapat digunakan, silahkan ganti KTP lain"
- **Sementara**: reset bulanan (lazy-triggered cleanup). Pesan: "KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini"
- `cleanupBlockedKtpAtEndOfMonthWib()` hanya hapus `block_type = 'temporary'` — permanen aman
- `checkBlockedKtpBatch()` dan `getBlockedKtpList()`: single query tanpa date filter, filter sementara di JS
- `addBlockedKtp(noKtp, reason?, blockType)`: upsert, deteksi perubahan jenis → pesan warning
- `changeBlockedKtpType(noKtp, newType)`: ubah jenis. Perm→temp WAJIB update `created_at` ke NOW (agar tidak langsung expired)
- `removeBlockedKtp()`: SELECT sebelum DELETE untuk tampilkan jenis di pesan konfirmasi
- Type: `KtpBlockType = 'permanent' | 'temporary'` (di supabase.ts)
- `BlockedKtpItem` punya field `block_type?: KtpBlockType`
- Admin menu KTP: 5 opsi (Tambah Permanen, Tambah Sementara, Lihat Daftar, Buka Blokir, Ubah Jenis)
- State: `BLOCKED_KTP_MENU`, `BLOCKED_KTP_ADD_PERMANENT`, `BLOCKED_KTP_ADD_TEMPORARY`, `BLOCKED_KTP_DELETE`, `BLOCKED_KTP_CHANGE_TYPE`, `BLOCKED_KTP_CHANGE_TYPE_CONFIRM`
- `pendingKtpTypeChange` Map di wa.ts: simpan data pending untuk 2-step confirmation flow ubah jenis
- Closure wrapper untuk `buildBlockedBulkAddSummary`: `(nomor, alasan?) => addBlockedKtp(nomor, alasan, 'permanent'|'temporary')`
- `parseBlockedBulkAddInput()` dan `buildBlockedBulkAddSummary()` TIDAK dimodifikasi (shared oleh KJP/KTP/KK)
- reply.ts: branch `ktp_blocked` pakai `err.detail` langsung (detail string di-set per jenis oleh `checkBlockedKtpBatch`)

### Location System
- 3 provider: `PASARJAYA`, `DHARMAJAYA`, `FOODSTATION`
- `ProviderType = 'PASARJAYA' | 'DHARMAJAYA' | 'FOODSTATION'` (di locationGate.ts)
- Location key format: `{PROVIDER} - {SubLocation}` (contoh: `PASARJAYA - Jakgrosir Kedoya`)
- Foodstation: single location, key = `FOODSTATION` (tanpa dash prefix). Display name = `Foodstation`
- Provider-level close: key = `PASARJAYA` / `DHARMAJAYA` / `FOODSTATION` (tanpa sub-location)
- `isSpecificLocationClosed()` cek 4 fase: jam operasional/override → sub-location → provider-level → quota (Dharmajaya only)
- Menu user dinamis: provider yang ditutup atau di luar jam tampil dengan label "(TUTUP - buka jam X)" di menu, user tetap bisa ketik nomornya tapi ditolak dengan pesan informatif + jam operasional

**Jam Operasional Registrasi** (di luar jam → tolak + pesan jam):
- Dharmajaya: 06:05 - 23:59 WIB
- Pasarjaya: 07:10 - 23:59 WIB
- Foodstation: 06:30 - 15:00 WIB
- Config: `REGISTRATION_HOURS` di messages.ts
- `isProviderOpen(provider)` → boolean (cek jam default)
- `isProviderAvailable(provider)` → boolean (cek blocked + jam + override)
- `getProviderClosedLabel(provider)` → string "buka jam XX.XX"
- Override: tabel `provider_operation_overrides` (upsert 1 row per provider)
  - `override_type`: 'open' (buka sampai 23:59 hari ini) atau 'close' (periode manual start-end)
  - `expires_at`: auto-expire untuk "Buka Sekarang"
  - Prioritas: open-override > close-override > default-hours > admin-block
- Admin menu: Opsi 1 > 4 "Atur Jam Per-Provider" → pilih provider → Buka/Tutup/Default
- State: `SETTING_PROVIDER_SELECT`, `SETTING_PROVIDER_ACTION`, `SETTING_PROVIDER_MANUAL_CLOSE_START`, `SETTING_PROVIDER_MANUAL_CLOSE_END`
- "Kembali ke Default" (opsi 3 di SETTING_OPERATION_MENU) juga reset semua override provider
- Global `isSystemClosed()` tetap layer 1 master switch — TIDAK DIUBAH

### Cek Status Pendaftaran Multi-Provider
- User ketik `5` / `STATUS` / `CEK STATUS` → sub-menu pilih provider (dinamis, hide tutup)
- Jika hanya 1 provider buka → bypass sub-menu, langsung cek
- Jika semua tutup → pesan "SEMUA LOKASI SEDANG TUTUP"
- State: `CHECK_STATUS_SELECT_PROVIDER` (di UserFlowState)
- Lock: `statusCheckInProgressByPhone` Map (prevent double-click, shared semua provider)
- `resolveStatusSourceItems(sourceDate, providerFilter?)` — filter data by provider prefix dari field `lokasi`
- `processProviderStatusCheck(providerKey, ...)` — shared helper, route ke service per-provider

**Jam Operasional** (di luar jam → tolak + pesan jam):
- Dharmajaya: 06:05 - 23:59 WIB
- Pasarjaya: 07:10 - 23:59 WIB
- Foodstation: 16:10 - 23:59 WIB
- Config: `STATUS_CHECK_HOURS` di messages.ts
- `isStatusCheckOpen(provider)` → boolean, `getStatusCheckClosedMessage(provider)` → string

**Per-Provider Service**:
- **Dharmajaya**: `checkRegistrationStatuses()` di statusCheckService.ts — TIDAK DIUBAH
- **Pasarjaya**: `checkPasarjayaStatuses()` di pasarjayaStatusCheck.ts
  - CSRF + cookie + redirect + HTML parse, native `https`, `rejectUnauthorized: false`
  - Identifier: `no_kjp` saja (tidak fallback)
  - Retry 3x, delay 2s, timeout 15s
  - Sukses: lokasi, tanggal pengambilan, nomor urut
- **Foodstation**: `checkFoodStationStatuses()` di foodStationStatusCheck.ts
  - POST `pmb.foodstation.co.id/KJPRegister/cetakUlang` dengan `nik=<no_ktp>`
  - Retry 3x, delay 2s, timeout 15s
  - Sukses: tanggal pengambilan, jam pengambilan (real dari server)

**Format Output** (statusCheckFormatter.ts):
- Pasarjaya sukses: Nama, Status, Lokasi, Tgl Pengambilan, No Urut
- Pasarjaya gagal copy: Nama, KJP, KTP, KK, `Tanggal Lahir DD-MM-YYYY` (dengan label+dash)
- Foodstation sukses: Nama, Status, Tgl Pengambilan, Jam
- Foodstation gagal copy: Nama, KJP, KTP, KK (TANPA tanggal lahir)
- Dharmajaya: format existing (`buildStatusSummaryMessage` + `buildFailedDataCopyMessage`)

**Sumber Data**:
- Dharmajaya & Pasarjaya: cek data **kemarin** (shiftIsoDate -1)
- Foodstation: cek data **hari ini** (processingDayKey, tanpa shift)
- Pesan no-data: "kemarin" untuk Dharmajaya/Pasarjaya, "hari ini" untuk Foodstation
- Pesan no-data selalu ditambah hint `_Ketik 0 untuk kembali atau ketik MENU untuk menu utama._`
- No-data branch di `processProviderStatusCheck`: Foodstation early-return langsung ke `STATUS_CHECK_NO_DATA_TEXT` (skip `todayCount` check). Dharmajaya/Pasarjaya cek `todayCount > 0` → pesan "data hari ini belum bisa dicek, sumber: data kemarin"

**Data Flow**:
- `getTodayRecapForSender` (recap.ts) SELECT `lokasi` + `tanggal_lahir` dari `data_harian`
- `resolveStatusSourceItems` carry kedua field (sebelumnya di-strip)
- `StatusCheckItem` interface punya `lokasi?: string` dan `tanggal_lahir?: string | null`
- `tanggal_lahir` stored `YYYY-MM-DD`, display `DD-MM-YYYY` via `convertDateToDisplay()`

### Fuzzy Matching Lokasi Pasarjaya ("Lokasi Lain")
- User pilih opsi 5 (Lokasi Lain) di sub-menu Pasarjaya → ketik nama lokasi → fuzzy match
- Referensi: `src/data/locations-pasarjaya.json` (97 lokasi, 5 wilayah, read-only)
- Service: `src/services/locationResolver.ts` — `resolveLocation(input)` → `LocationEntry[]`
- Algoritma 3-tahap (deterministik, BUKAN fuzzy scoring):
  1. Full phrase: `keyword in normalized` (substring match). Exact match → auto-select.
  2. No-space: hapus spasi, match jika input ≥ 4 karakter. Exact match → auto-select.
  3. Token fallback: split kata, filter stopwords, cari token paling sedikit match.
- Stopwords: jakut, jakpus, jakbar, jaktim, jaksel, kec, kel, jl, jalan, di, dan
- Hasil: 1 match → langsung pakai. 2-10 match → daftar bernomor + wilayah, user pilih angka. >10 → tolak, minta lebih spesifik. 0 → minta ketik ulang.
- MAX_CANDIDATES = 10 (resolver cap, bukan UI cap)
- Nama disimpan = nama resmi dari locations.json (bukan input user)
- State: `INPUT_MANUAL_LOCATION_CONFIRM` + `EDIT_INPUT_MANUAL_LOCATION_CONFIRM` (di UserFlowState)
- `pendingLocationCandidates` Map di state.ts (cleanup di `clearTransientSessionContext`)
- Berlaku juga di EDIT flow (`EDIT_INPUT_MANUAL_LOCATION`)
- `skipDataValidation` guard di wa.ts include kedua state CONFIRM
- Stale session (bot restart) → "Sesi kedaluwarsa, ketik ulang nama lokasi"

### Parser Pipeline (`parseRawMessageToLines`)
- Lokasi: `src/parser.ts:333+`
- Pipeline: sanitize → split `\n` → merge label-only → **split KJP+NIK** → **split multi-number** → **split Nama+KJP** → existing auto-split
- **Sanitasi** (urutan penting):
  1. Invisible chars + NFKC normalize
  2. `disablitas` → `Disabilitas` (typo fix)
  3. `\.{2,}` → `:` (titik ganda/triple → colon, aman untuk `Hj.` yang 1 dot)
  4. `=` → `:` (normalisasi tanda sama dengan setelah label)
  5. `:+` → `:` (dedup colon)
  5. `(\d)\.+(?=\s|$)` → `$1` (strip trailing dot setelah angka, aman untuk nama seperti `Hj.`)
- **Tahap 1 — Split KJP+NIK**: Deteksi `504948`-prefix number + NIK/KTP label atau bare 16-digit number di baris yang sama. Push full remainder (bukan hanya angka pertama) agar Tahap 1.5 bisa split lebih lanjut.
- **Tahap 1.5 — Split Multi-Number**: Scan baris dengan ≥2 angka 16-digit. Split di boundary label keyword terdekat, atau di awal whitespace run jika tanpa label. Regex label: `multiNumLabelRe` (30+ alias kartu).
- **Tahap 2 — Split Nama+KJP**: Deteksi nama orang sebelum `504948` number. 3 guard: nama ≥2 huruf, nama bukan hanya label keyword, KJP part tidak kosong.
- **JANGAN ubah**: `extractCardNumber`, `extractCardText`, `extractDigits`, `groupLinesToBlocks`, `buildParsedFields`
- Parser TIDAK pernah mengubah angka — hanya split baris

### Admin Menu (11 opsi, A-Z sorted)
```
1. Atur Status Buka/Tutup Bot
2. Export Data (TXT & XLSX)
3. Hapus Data User (per Orang)
4. Kelola Blokir Nomor → sub-menu KJP/KTP/KK/HP
5. Kelola Buka/Tutup Lokasi → Toggle + Jadwal
6. Kelola Kontak → Cari/Tambah/Lihat/Hapus
7. Kelola Kuota Lokasi → Per User/Global
8. Kelola Prefix Kartu
9. Kelola Whitelist No HP
10. Laporan & Analitik → Statistik/Log/Cari Data/Broadcast
11. Rekap Data → Hari Ini/Tanggal/Rentang
```
- Trigger: ketik `0`, `ADMIN`, atau `ADMIN MENU`
- Auth: `isAdminPhone()` dari whitelistGate.ts
- Sub-menu states: `BLOCK_NUMBER_MENU`, `QUOTA_MENU`, `REPORT_MENU`, `REKAP_MENU`

### Naming Conventions
- File: camelCase (`locationGate.ts`, `adminLocationMenu.ts`)
- State: UPPER_SNAKE_CASE (`LOCATION_MGMT_MENU`, `BLOCKED_KTP_ADD_PERMANENT`)
- Function: camelCase (`isSpecificLocationClosed`, `buildProviderMenuWithStatus`)
- DB table: snake_case (`blocked_locations`, `location_schedules`)
- Pesan ke user: Bahasa Indonesia

---

## 3. Test Infrastructure

### Setup
- Runner: `bun test --isolate` (flag `--isolate` WAJIB untuk hindari mock collision)
- Config: `bunfig.toml` (root=./src/tests, preload setup.ts, timeout 10000)
- tsconfig.json: `src/tests` di-exclude dari tsc build
- Package.json: `"test": "npx bun test --isolate"`

### Mock Pattern (KRITIS — baca ini sebelum tulis test)
`bun:test` `mock.module()` bersifat **process-global** — mock dari satu file mempengaruhi file lain.

**Pattern yang benar:**
1. `mock.module('../supabase', () => ({...actualModule, functionToMock: mock(...)}))`
2. Per-test dynamic import dengan query suffix: `import('../services/locationGate.ts?test=1')`
3. Spread-actual pattern: `const actualModule = await import('../supabase'); mock.module(..., () => ({...actualModule, ...}))`
4. `beforeEach` reset semua mock state
5. `mock.restore()` di awal file jika perlu clean slate

**Anti-pattern:**
- Import static di top-level → dapat cached module, mock tidak berlaku
- Reassign mock setelah import → tidak konsisten antar test
- Tanpa `--isolate` flag → cross-file mock interference

### Test Files (30 files, ~555+ tests)
```
locationGate.test.ts          # 14 tests: 9 provider×state matrix + quota + helpers
supabase-location.test.ts     # 10 tests: CRUD blocked_locations + schedules
adminLocationMenu.test.ts     # 17 tests: semua state transition + validation
locationScheduler.test.ts     # 8 tests: one-time/recurring/error/lifecycle
integration-location.test.ts  # 6 tests: end-to-end flow (close→reject→open→schedule)
blockedKtp.test.ts            # 23 tests: 6 fungsi KTP (cleanup, check, list, add, remove, changeType)
blockedKtpIntegration.test.ts # 7 tests: end-to-end dual block type (perm/temp flow, reply, cleanup)
pasarjayaStatusCheck.test.ts  # 6 tests: CSRF extraction, HTML parse, cookie merge
foodStationStatusCheck.test.ts# 4 tests: parseDetailFromHtml (capture-area, edge cases)
statusCheckFormatter.test.ts  # 10 tests: format summary + failed copy per-provider
statusCheck-multiProvider.test.ts # 6 tests: routing, filtering, blocked provider exclusion
locationResolver.test.ts          # 12 tests: 3-tahap substring search, stopwords, tiebreaker
locationResolver-integration.test.ts # 7 tests: single/multi match, cancel, stale session
parser.test.ts                    # 131 tests: parseRawMessageToLines (sanitasi, split KJP+NIK, multi-number, Nama+KJP, regression)
providerHours.test.ts             # 23 tests: isProviderOpen, getProviderClosedLabel, Phase 0, isProviderAvailable, menu labels
supabase-override.test.ts         # 4 tests: CRUD provider_operation_overrides
providerHours-integration.test.ts # 7 tests: override priority, expiry, status check unaffected
+ 16 file test lainnya (time, messages, dll)
```

### Known Test Failures (pre-existing, bukan bug)
- `time.test.ts`: timezone-dependent, gagal di mesin dengan TZ bukan WIB
- `messages.test.ts`: MAPPING count assertion outdated setelah tambah FOODSTATION_MAPPING

---

## 4. Keputusan Desain

### Location Toggle System (April 2026)
| Keputusan | Pilihan | Alasan |
|-----------|---------|--------|
| Toggle level | Provider + sub-location | User minta keduanya |
| Pasarjaya toggle | DB (bukan .env) | Bisa toggle tanpa restart |
| Foodstation | Bisa ditutup (sebelumnya hardcoded open) | Konsistensi 3 provider |
| Jadwal | One-time + recurring daily | User minta keduanya |
| Scheduler | DB-persisted + polling 60s | Survive restart, no external deps |
| openLocation() | Soft-toggle (is_active=false) | Schedule butuh persistent row |
| Provider-level close | Separate key (e.g. `PASARJAYA`) | Handle "Lokasi Lain" free-text |
| Audit log | Tidak ada | User tidak mau |
| Mid-flow rejection | Tolak saat submit | User pilih ini vs tolak saat pilih |
| Menu user | Dinamis — hide provider tutup | User minta agar tidak membingungkan |

### Admin Menu Consolidation (April 2026)
- 23 opsi → 11 opsi (A-Z sorted)
- Grouping: Rekap (3→1), Kontak (3→1), Blokir (4→1), Kuota (2→1), Laporan (4→1)
- Opsi 19 lama (Kelola Lokasi Penuh) dihapus, diganti opsi 5 (Kelola Buka/Tutup Lokasi)

### Cek Status Multi-Provider (April 2026)
| Keputusan | Pilihan | Alasan |
|-----------|---------|--------|
| Sub-menu provider | Dinamis — hide tutup, bypass jika 1 buka | Konsisten dengan menu lokasi |
| Jam operasional | Per-provider hardcode di config | Simpel, tidak perlu DB |
| Pasarjaya identifier | no_kjp saja (tidak fallback) | Sesuai script existing |
| Foodstation identifier | no_ktp (NIK) | Sesuai API Foodstation |
| Pasarjaya gagal copy | Include `Tanggal Lahir DD-MM-YYYY` | User minta untuk re-submit |
| Foodstation gagal copy | TANPA tanggal lahir | Foodstation tidak butuh |
| Foodstation sukses detail | Tgl + jam pengambilan (real dari server) | Bukan formula/H+1 |
| Display name | `Foodstation` (satu kata) | Konsisten dengan menu lokasi |
| Error message | Seragam semua provider | "Sedang ada kendala, mohon ulangi" |
| Dharmajaya flow | TIDAK DIUBAH sama sekali | Sudah jalan, jangan rusak |
| HTTP client | Native `https` module | Tidak tambah dependency |
| Retry | 3x per-item, delay 2s | Sesuai script existing |

### Fuzzy Matching Lokasi Pasarjaya (April 2026)
| Keputusan | Pilihan | Alasan |
|-----------|---------|--------|
| Algoritma | 3-tahap substring search (bukan fuzzy scoring) | Sesuai Python bot existing |
| Single match | Langsung pakai tanpa konfirmasi | UX cepat |
| Multiple match (2-10) | Daftar bernomor + wilayah, user pilih | Disambiguasi jelas |
| Multiple match (>10) | Tolak, minta lebih spesifik | Terlalu banyak opsi membingungkan |
| No match | Minta ketik ulang | User bisa coba lagi |
| Nama disimpan | Nama resmi dari locations.json | Konsistensi data |
| EDIT flow | Ya, resolver juga di EDIT_INPUT_MANUAL_LOCATION | Konsistensi behavior |
| Pending Map | Di state.ts (bukan wa.ts) | Proper cleanup via clearTransientSessionContext |
| Wilayah di daftar | Ya, tampilkan `[Jakarta Pusat] Nama Lokasi` | Bantu orientasi geografis |
| Overflow >10 | Tolak langsung (tidak tampilkan partial) | Simpel, minta spesifik |

### Fix Parser Multi-Field Split (April 2026)
- Bug: User kirim data 4 field tapi WhatsApp merge jadi 2-3 baris → bot tolak "DATA TIDAK LENGKAP"
- Pola yang di-fix: (1) KJP+NIK satu baris, (2) Nama+KJP satu baris, (3) 3+ field satu baris, (4) `=` setelah label, (5) trailing dot setelah angka
- Fix: 3 tahap split baru di `parseRawMessageToLines` antara merge-label dan auto-split
- Sanitasi baru: `=` → `:` dan strip trailing dot (aman untuk nama `Hj.`)
- Parser TIDAK pernah mengubah angka — hanya split baris
- Positional ordering: baris 3 = KTP, baris 4 = KK (tidak perlu label-based reorder)
- Scope lock: JANGAN ubah `extractCardNumber`, `extractCardText`, `extractDigits`, `groupLinesToBlocks`, `buildParsedFields`

### Jam Operasional Per-Provider (April 2026)
| Keputusan | Pilihan | Alasan |
|-----------|---------|--------|
| Jam default | Hardcode di config (messages.ts) | Simpel, tidak perlu DB |
| Override storage | Tabel `provider_operation_overrides` (upsert 1 row per provider) | Persist, survive restart |
| Menu saat tutup | Tampil + label "(buka jam X)" | User tahu kapan buka |
| Tutup Sekarang | Periode manual (start-end datetime) | Fleksibel |
| Buka Sekarang | Auto-expire 23:59 WIB hari itu | Besok kembali default otomatis |
| Global switch | Tetap ada sebagai master switch (layer 1) | Backward compatible |
| Kembali ke Default | Reset SEMUA override provider sekaligus | Satu aksi untuk reset semua |
| Buka/Tutup Sekarang | Per-provider (sub-menu pilih provider) | Granular control |
| Di luar jam | Tolak + info jam operasional | User tahu kapan bisa daftar |
| Prioritas | open-override > close-override > default-hours > admin-block | Jelas dan predictable |

### Pilih Lokasi & Rename Foodstation (April 2026)
- Pesan "Pilih Lokasi Dulu" disederhanakan: hapus preview sub-lokasi Dharmajaya dan instruksi "Balas bertahap". Sub-lokasi muncul setelah user pilih Dharmajaya (flow existing).
- Display name `Foodstation` di semua pesan ke user. Internal key = `FOODSTATION`.

### Fix State Bug Atur Status Bot (April 2026)
- Bug: Setelah aksi "Buka Sekarang" atau "Kembali ke Default", state di-set ke `MENU` (menu admin utama). Input berikutnya ditangkap sebagai pilihan menu admin, bukan sub-menu Atur Status Bot.
- Fix: State tetap di `SETTING_OPERATION_MENU` setelah aksi berhasil. Ditambah hint `_Ketik 0 untuk kembali ke menu admin._` di pesan sukses.

### Fix Early Line Validation + Pesan Error Ramah (April 2026)
- Bug: User kirim data 4 baris → bot minta pilih lokasi → pilih Pasarjaya → bot lanjut ke sub-lokasi → gagal proses → pesan error teknis. Seharusnya ditolak lebih awal saat pilih Pasarjaya.
- Fix 1: Tambah early rejection di `SELECT_LOCATION` handler untuk Pasarjaya. Kondisi: `lines.length % 4 === 0 && lines.length % 5 !== 0` (inverse dari Dharmajaya/Foodstation). User tetap di `SELECT_LOCATION` agar bisa pilih lokasi lain.
- Fix 2: 4 pesan error teknis (`Data X Gagal Proses`) diganti jadi pesan ramah dengan `CONTOH YANG BENAR` dan `Mohon kirim ulang ya Bu/Pak 🙏`. Pesan tidak mengasumsikan baris mana yang kurang.
- Catatan: 5 baris = Pasarjaya, 4 baris = Dharmajaya & Foodstation. Edge case 20 baris (kelipatan 4 DAN 5) tidak di-reject.

### Blokir KTP 2 Jenis — Permanen & Sementara (April 2026)
| Keputusan | Pilihan | Alasan |
|-----------|---------|--------|
| Migrasi existing records | Default `'temporary'` | Preservasi behavior lama (monthly reset) |
| Query strategy | Single query tanpa date filter, filter di JS | Satu DB round-trip, lebih simpel |
| Upsert beda jenis | Warn + overwrite | Paling praktis, admin dapat feedback |
| `reason` field | Tetap optional internal note | Zero format change, shared parser tidak diubah |
| List display | Permanen dulu, lalu Sementara, dengan count | User minta split 2 bagian |
| Ubah jenis flow | 2-step confirmation (pilih KTP → YA/TIDAK) | Hindari salah ubah |
| Perm→temp `created_at` | Update ke NOW | Agar tidak langsung expired (edge case kritis) |
| Cleanup filter | `.eq('block_type', 'temporary')` | Highest-risk change, TDD first |
| Shared parser | Closure wrapper, TIDAK modifikasi | `parseBlockedBulkAddInput` dan `buildBlockedBulkAddSummary` shared oleh KJP/KTP/KK |

---

## 5. Deploy

### Build & Deploy
```bash
# Build
npm run build          # tsc → dist/ + copy src/data/ ke dist/data/

# Deploy ke STB
scp -r dist/ package.json package-lock.json .env user@192.168.100.104:/path/to/bot/
ssh user@192.168.100.104 "cd /path/to/bot && npm install --production && pm2 restart bot-kjp"
```

### Deploy Script
`deploy_STB.bat` — batch script untuk SCP + SSH deploy

### PM2
- Process name: `bot-kjp`
- Restart: `pm2 restart bot-kjp`
- Logs: `pm2 logs bot-kjp`

---

## 6. Gotchas & Pitfalls

1. **wa.ts 7000+ baris** — JANGAN refactor keseluruhan. Ubah hanya bagian yang relevan.
2. **bun:test mock global** — Selalu pakai `--isolate` flag dan dynamic import per-test.
3. **tsc vs bun** — `bun:test` import menyebabkan tsc error. Test files di-exclude via tsconfig.json.
4. **Foodstation key** — Display name: `Foodstation`. Internal key: `FOODSTATION`. Provider type: `FOODSTATION`.
5. **0-escape prevention** — wa.ts punya guard agar input `0` tidak keluar dari sub-menu tertentu. Tambahkan prefix state baru ke guard ini.
6. **Supabase SQL** — File di `src/sql/` adalah reference DDL. Untuk tabel yang sudah ada, pakai `ALTER TABLE ADD COLUMN IF NOT EXISTS`, bukan `CREATE TABLE IF NOT EXISTS`.
7. **Timezone** — Semua waktu pakai WIB (Asia/Jakarta). Gunakan `getWibParts()` dari time.ts.
8. **PASARJAYA_DISABLED** — Sudah dihapus dari .env. Semua toggle sekarang via DB.
9. **Dynamic import di wa.ts** — `adminLocationMenu.ts` di-import secara dynamic (`const { handleLocationMgmt } = await import(...)`) untuk menghindari circular dependency. Begitu juga `pasarjayaStatusCheck.ts` dan `foodStationStatusCheck.ts`.
10. **Commit via CMD** — Hindari double quotes di commit message saat pakai CMD/batch. Gunakan single quotes atau escape.
11. **StatusCheckItem** — Interface di `statusCheckService.ts` punya field `lokasi?` dan `tanggal_lahir?`. `resolveStatusSourceItems` di wa.ts carry kedua field dari `getTodayRecapForSender`. Sebelumnya di-strip.
12. **Pasarjaya TLS** — `rejectUnauthorized: false` WAJIB untuk HTTPS ke `antrianpanganbersubsidi.pasarjaya.co.id`. Tanpa ini, request gagal SSL error.

---

## 7. DB Schema (Supabase)

### blocked_locations
```sql
id bigserial PRIMARY KEY,
location_key text NOT NULL UNIQUE,
provider text NOT NULL DEFAULT '',
reason text NULL,
is_active boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
-- Index: idx_blocked_locations_active (is_active, location_key)
-- Index: idx_blocked_locations_provider (provider)
```

### location_schedules
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
provider text NOT NULL,
sub_location text NULL,
action text NOT NULL,           -- 'open' atau 'close'
schedule_type text NOT NULL,    -- 'one_time' atau 'recurring'
scheduled_time timestamptz NULL,-- untuk one_time
recurring_time text NULL,       -- 'HH:mm' WIB untuk recurring
reason text NULL,
is_active boolean NOT NULL DEFAULT true,
last_executed_at timestamptz NULL,
created_at timestamptz NOT NULL DEFAULT now()
-- Index: idx_location_schedules_active (is_active, schedule_type)
-- Index: idx_location_schedules_provider (provider)
```

### provider_operation_overrides
```sql
provider text PRIMARY KEY,
override_type text NOT NULL,    -- 'open' atau 'close'
expires_at timestamptz NULL,    -- auto-expire untuk "Buka Sekarang"
manual_close_start timestamptz NULL,
manual_close_end timestamptz NULL,
created_at timestamptz NOT NULL DEFAULT now()
-- Index: idx_provider_overrides_type (override_type)
```

### blocked_ktp
```sql
no_ktp text PRIMARY KEY,
reason text NULL,
block_type text NOT NULL DEFAULT 'temporary',  -- 'permanent' atau 'temporary'
created_at timestamptz NOT NULL DEFAULT now()
-- TIDAK ada kolom updated_at (berbeda dari blocked_locations)
-- Index: idx_blocked_ktp_block_type (block_type)
```

---

## 8. Scope Locks (JANGAN dilakukan tanpa permintaan eksplisit)

- JANGAN refactor wa.ts di luar scope task
- JANGAN tambah external scheduling library (node-cron, bull, agenda)
- JANGAN merge kuota management ke menu lokasi
- JANGAN tambah notifikasi WhatsApp untuk eksekusi jadwal
- JANGAN tambah audit logging
- JANGAN tambah bulk "tutup semua" command
- JANGAN over-engineer schema (tambah kolom hanya jika diminta)
