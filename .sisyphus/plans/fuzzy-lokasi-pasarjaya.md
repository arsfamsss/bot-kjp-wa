# Fuzzy Location Matching — Pasarjaya "Lokasi Lain"

## TL;DR

> **Ringkasan**: Tambah fuzzy matching untuk input lokasi manual Pasarjaya (opsi 5 "Lokasi Lain"). Saat user ketik nama lokasi, bot cari di database referensi (~97 lokasi), tampilkan kandidat jika ambigu, atau tolak jika tidak ditemukan. Algoritma: 3-tahap substring search (bukan fuzzy scoring).
>
> **Deliverables**:
> - `src/data/locations-pasarjaya.json` — data referensi lokasi (copy dari BOT PASARJAYA)
> - `src/services/locationResolver.ts` — resolver 3-tahap + index loader
> - State baru `INPUT_MANUAL_LOCATION_CONFIRM` + `EDIT_INPUT_MANUAL_LOCATION_CONFIRM`
> - Modifikasi `INPUT_MANUAL_LOCATION` + `EDIT_INPUT_MANUAL_LOCATION` handler di wa.ts
> - Unit + integration tests
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (data) → T2 (resolver) → T4 (wa.ts wiring) → T6 (tests)

---

## Context

### Original Request
User minta: saat user ketik opsi 5 "Lokasi Lain" di Pasarjaya dan isi nama lokasi, sebelum disimpan bot kasih opsi dulu — cari lokasi yang mirip di database, tampilkan saran, biarkan user pilih. Seperti yang dilakukan oleh Python bot `1_SIAPKAN_DATA_HARIAN.py`.

### Interview Summary
**Key Discussions**:
- Single match (1 result) → langsung pakai, tanpa konfirmasi
- Multiple match (2-10) → tampilkan daftar bernomor dengan wilayah, user balas angka
- Multiple match (>10) → tolak, minta ketik lebih spesifik
- No match → minta ketik ulang, jelaskan lokasi tidak ada di database
- Nama disimpan → nama resmi dari locations.json (bukan input user mentah)
- locations.json → copy ke project (`src/data/`)
- Terapkan juga di `EDIT_INPUT_MANUAL_LOCATION` (flow edit lokasi)
- Tampilkan wilayah di daftar kandidat: `[Jakarta Pusat] Gerai Pasar Tanah Abang Blok G`
- Algoritma: 3-tahap substring search (full phrase → no-space → token fallback)
- Stopwords: jakut, jakpus, jakbar, jaktim, jaksel, kec, kel, jl, jalan, di, dan

**Research Findings**:
- Python reference: `resolve_lokasi_pasarjaya()` di `1_SIAPKAN_DATA_HARIAN.py:1829+`
- locations.json: 97 lokasi unik, 5 wilayah, zero duplikat nama
- Semua 4 nama hardcoded di PASARJAYA_MAPPING ada exact match di locations.json
- Insertion point wa.ts: antara line 3587 (capture input) dan 3598 (store in Map)
- EDIT flow: `EDIT_INPUT_MANUAL_LOCATION` di wa.ts:2588

### Metis Review
**Identified Gaps** (addressed):
- `EDIT_INPUT_MANUAL_LOCATION` harus ikut resolver → user confirmed YES
- `skipDataValidation` guard harus include state baru → ditambahkan di plan
- `clearTransientSessionContext` harus cleanup pending Map → ditambahkan di plan
- Provider blocked check di state CONFIRM → ditambahkan di plan
- Overflow >10 match → tolak, minta spesifik (user confirmed)
- Stale candidates setelah restart → handle "sesi kedaluwarsa"

---

## Work Objectives

### Core Objective
Tambah validasi lokasi berbasis database referensi untuk input manual Pasarjaya, dengan 3-tahap substring search dan interactive disambiguation via WhatsApp.

### Concrete Deliverables
- `src/data/locations-pasarjaya.json` — copy dari `D:\BOT\BOT PASARJAYA\locations.json`
- `src/services/locationResolver.ts` — resolver service (pure function, no side effects)
- State `INPUT_MANUAL_LOCATION_CONFIRM` + `EDIT_INPUT_MANUAL_LOCATION_CONFIRM` di state.ts
- Handler modifications di wa.ts untuk kedua flow (new + edit)
- `pendingLocationCandidates` Map di state.ts
- Unit tests: `locationResolver.test.ts`, integration test

### Definition of Done
- [ ] User ketik lokasi → bot resolve dari database → simpan nama resmi
- [ ] Ambigu (2-10 match) → daftar bernomor → user pilih → simpan
- [ ] >10 match → tolak, minta spesifik
- [ ] Tidak ketemu → minta ketik ulang
- [ ] Edit flow juga pakai resolver
- [ ] `bun test --isolate` semua pass
- [ ] `tsc --noEmit` clean

### Must Have
- 3-tahap substring search (full phrase → no-space → token fallback)
- Stopwords: jakut, jakpus, jakbar, jaktim, jaksel, kec, kel, jl, jalan, di, dan
- Exact match tiebreaker (jika ada exact + substring, pilih exact)
- Wilayah ditampilkan di daftar kandidat
- Nama resmi dari JSON disimpan (bukan input user)
- Cancel dengan `0` di semua state
- Provider blocked check di state CONFIRM
- Stale session handling (restart → "sesi kedaluwarsa")
- `skipDataValidation` include state baru
- `clearTransientSessionContext` cleanup pending Map

### Must NOT Have (Guardrails)
- JANGAN tambah library fuzzy matching (fuse.js, Levenshtein, dll)
- JANGAN modifikasi PASARJAYA_MAPPING (opsi 1-4 tetap hardcoded)
- JANGAN tambah admin CRUD untuk locations
- JANGAN modifikasi shared parsers (parseBlockedBulkAddInput, buildBlockedBulkAddSummary)
- JANGAN refactor wa.ts di luar scope (routing only)
- JANGAN simpan/display `kode` lokasi (hanya nama)
- JANGAN tambah hot-reload untuk locations.json

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (bun test sudah setup dari plan sebelumnya)
- **Automated tests**: Tests-after
- **Framework**: bun test --isolate

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── T1: Copy locations.json + buat loader [quick]
├── T2: Buat locationResolver.ts service [deep]
└── T3: Tambah state + pending Map di state.ts [quick]

Wave 2 (After Wave 1 — integration):
├── T4: Wire INPUT_MANUAL_LOCATION di wa.ts [unspecified-high]
└── T5: Wire EDIT_INPUT_MANUAL_LOCATION di wa.ts [unspecified-high]

Wave 3 (After Wave 2 — tests):
├── T6: Unit test locationResolver.ts [implementation]
└── T7: Integration test full flow [implementation]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [review]
├── F3: Real manual QA [testing]
└── F4: Scope fidelity check [deep]
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | - | T2, T4, T5 | 1 |
| T2 | T1 | T4, T5, T6 | 1 |
| T3 | - | T4, T5 | 1 |
| T4 | T2, T3 | T7 | 2 |
| T5 | T2, T3 | T7 | 2 |
| T6 | T2 | - | 3 |
| T7 | T4, T5 | - | 3 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `deep`, T3 `quick`
- **Wave 2**: 2 tasks — T4 `unspecified-high`, T5 `unspecified-high`
- **Wave 3**: 2 tasks — T6 `implementation`, T7 `implementation`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `review`, F3 `testing`, F4 `deep`

---

## TODOs

- [x] 1. Copy locations.json + Buat Loader

  **What to do**:
  - Copy `D:\BOT\BOT PASARJAYA\locations.json` ke `src/data/locations-pasarjaya.json`
  - Buat fungsi `loadPasarjayaLocations()` di `src/services/locationResolver.ts` yang:
    - Baca JSON file saat module load (top-level)
    - Flatten struktur wilayah→lokasi ke array `LocationEntry[]`
    - Setiap entry: `{ kode, nama, wilayah, wilayahNama, normalized, normalizedNospace }`
    - `normalized` = `nama.toLowerCase()`
    - `normalizedNospace` = `nama.toLowerCase().replace(/\s/g, '')`
  - Export `LOCATION_INDEX: LocationEntry[]` (module-level constant, loaded once)
  - Export interface `LocationEntry` dan `LocationMatch`

  **Must NOT do**:
  - JANGAN tambah hot-reload atau file watcher
  - JANGAN modifikasi locations.json (read-only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T2, T4, T5
  - **Blocked By**: None

  **References**:
  - `D:\BOT\BOT PASARJAYA\locations.json` — sumber data, 97 lokasi, 5 wilayah
  - `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:1792-1824` — Python `load_locations_pasarjaya()` pattern
  - `src/services/locationGate.ts` — contoh service file pattern di project ini

  **Acceptance Criteria**:
  - [ ] File `src/data/locations-pasarjaya.json` ada dan valid JSON
  - [ ] `LOCATION_INDEX` punya 97 entries
  - [ ] Setiap entry punya field: kode, nama, wilayah, wilayahNama, normalized, normalizedNospace
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:
  ```
  Scenario: Loader menghasilkan index lengkap
    Tool: Bash (bun eval)
    Steps:
      1. bun eval "const { LOCATION_INDEX } = require('./src/services/locationResolver'); console.log(LOCATION_INDEX.length)"
      2. Assert output = 97
    Expected Result: 97 lokasi ter-index
    Evidence: .sisyphus/evidence/task-1-loader-count.txt

  Scenario: Entry punya semua field
    Tool: Bash (bun eval)
    Steps:
      1. bun eval "const { LOCATION_INDEX } = require('./src/services/locationResolver'); const e = LOCATION_INDEX[0]; console.log(Object.keys(e).sort().join(','))"
      2. Assert output contains: kode,nama,normalized,normalizedNospace,wilayah,wilayahNama
    Expected Result: Semua field ada
    Evidence: .sisyphus/evidence/task-1-entry-fields.txt
  ```

  **Commit**: YES (group with T2, T3)
  - Message: `feat(lokasi): tambah resolver lokasi Pasarjaya + data referensi`
  - Files: `src/data/locations-pasarjaya.json`, `src/services/locationResolver.ts`

- [x] 2. Buat locationResolver.ts — 3-Tahap Substring Search

  **What to do**:
  - Di `src/services/locationResolver.ts` (file yang sama dari T1), tambah fungsi:
  - `resolveLocation(input: string): LocationMatch[]` — pure function, no side effects
  - **Stage 1 — Full phrase**: `normalized(input)` dicari sebagai substring di setiap `entry.normalized`. Jika ada exact match (`entry.normalized === normalized(input)`), return hanya exact match.
  - **Stage 2 — No-space**: Jika stage 1 gagal DAN `input.replace(/\s/g,'').length >= 4`, cari `normalizedNospace(input)` di `entry.normalizedNospace`. Exact no-space match wins.
  - **Stage 3 — Token fallback**: Jika stage 2 gagal, split input ke tokens, filter stopwords (`STOPWORDS` set) dan token `< 3` chars. Untuk setiap token, cari substring match. Pilih token yang menghasilkan jumlah match paling sedikit (least ambiguous).
  - `STOPWORDS`: `new Set(['jakut','jakpus','jakbar','jaktim','jaksel','kec','kel','jl','jalan','di','dan'])`
  - Return `LocationMatch[]` = `LocationEntry[]` (same shape, just the matches)
  - Export `MAX_CANDIDATES = 10`

  **Must NOT do**:
  - JANGAN tambah library fuzzy (fuse.js, Levenshtein, dll)
  - JANGAN tambah side effects (DB call, state mutation, messaging)
  - JANGAN cache results (97 items, scan instant)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1 — same file, T1 does loader, T2 does resolver. Bisa digabung jadi 1 task jika agent sama)
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T4, T5, T6
  - **Blocked By**: T1 (needs LOCATION_INDEX)

  **References**:
  - `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:1829-1924` — Python `resolve_lokasi_pasarjaya()` reference implementation
  - Stage 1: line 1849-1883 (full phrase + exact tiebreaker)
  - Stage 2: line 1885-1899 (no-space)
  - Stage 3: line 1901-1924 (token fallback + stopwords + least-ambiguous)

  **Acceptance Criteria**:
  - [ ] `resolveLocation("tanah abang")` returns 1 match (Gerai Pasar Tanah Abang Blok G)
  - [ ] `resolveLocation("jakmart")` returns multiple matches (semua Jakmart)
  - [ ] `resolveLocation("tanahabang")` returns match via no-space stage
  - [ ] `resolveLocation("xyzabc123")` returns empty array
  - [ ] `resolveLocation("jl pasar di senen")` filters stopwords, finds Pasar Senen
  - [ ] `resolveLocation("di jalan kec")` returns empty (all stopwords)
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:
  ```
  Scenario: Single match — full phrase
    Tool: Bash (bun eval)
    Steps:
      1. bun eval "const { resolveLocation } = require('./src/services/locationResolver'); const r = resolveLocation('tanah abang'); console.log(r.length, r[0]?.nama)"
      2. Assert: length=1, nama contains "Tanah Abang"
    Expected Result: 1 match, nama resmi
    Evidence: .sisyphus/evidence/task-2-single-match.txt

  Scenario: Multiple match
    Tool: Bash (bun eval)
    Steps:
      1. bun eval "const { resolveLocation } = require('./src/services/locationResolver'); console.log(resolveLocation('jakmart').length)"
      2. Assert: length > 1
    Expected Result: Multiple Jakmart locations
    Evidence: .sisyphus/evidence/task-2-multi-match.txt

  Scenario: No match
    Tool: Bash (bun eval)
    Steps:
      1. bun eval "const { resolveLocation } = require('./src/services/locationResolver'); console.log(resolveLocation('xyzabc123').length)"
      2. Assert: length = 0
    Expected Result: Empty array
    Evidence: .sisyphus/evidence/task-2-no-match.txt

  Scenario: No-space stage
    Tool: Bash (bun eval)
    Steps:
      1. bun eval "const { resolveLocation } = require('./src/services/locationResolver'); const r = resolveLocation('tanahabang'); console.log(r.length, r[0]?.nama)"
      2. Assert: length >= 1, nama contains "Tanah Abang"
    Expected Result: Match via no-space
    Evidence: .sisyphus/evidence/task-2-nospace.txt

  Scenario: Token fallback with stopwords
    Tool: Bash (bun eval)
    Steps:
      1. bun eval "const { resolveLocation } = require('./src/services/locationResolver'); const r = resolveLocation('jl pasar di senen'); console.log(r.map(x=>x.nama))"
      2. Assert: results contain Senen-related locations
    Expected Result: Stopwords filtered, relevant match found
    Evidence: .sisyphus/evidence/task-2-token-fallback.txt
  ```

  **Commit**: YES (group with T1, T3)
  - Message: `feat(lokasi): tambah resolver lokasi Pasarjaya + data referensi`
  - Files: `src/services/locationResolver.ts`

- [x] 3. Tambah State + Pending Map di state.ts

  **What to do**:
  - Tambah `'INPUT_MANUAL_LOCATION_CONFIRM'` ke `UserFlowState` type union di state.ts
  - Tambah `'EDIT_INPUT_MANUAL_LOCATION_CONFIRM'` ke `UserFlowState` type union di state.ts (BUKAN AdminFlowState — karena EDIT_INPUT_MANUAL_LOCATION sudah di UserFlowState)
  - Tambah `pendingLocationCandidates: Map<string, LocationMatch[]>` export di state.ts
  - Tambah cleanup `pendingLocationCandidates` di `clearTransientSessionContext()` (wa.ts:1184)

  **Must NOT do**:
  - JANGAN ubah state lain
  - JANGAN tambah Map di wa.ts (harus di state.ts)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: T4, T5
  - **Blocked By**: None

  **References**:
  - `src/state.ts:7-25` — UserFlowState type union
  - `src/state.ts:50-80` — AdminFlowState type union
  - `src/state.ts:169-172` — existing Maps (userLocationChoice, userSpecificLocationChoice)
  - `src/wa.ts:184` — `clearTransientSessionContext()` function
  - `src/state.ts:204` — `pendingKtpTypeChange` Map pattern (tapi ini di wa.ts, bukan state.ts — kita perbaiki pattern)

  **Acceptance Criteria**:
  - [ ] `INPUT_MANUAL_LOCATION_CONFIRM` ada di UserFlowState
  - [ ] `EDIT_INPUT_MANUAL_LOCATION_CONFIRM` ada di UserFlowState
  - [ ] `pendingLocationCandidates` Map exported dari state.ts
  - [ ] `clearTransientSessionContext` cleanup pendingLocationCandidates
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:
  ```
  Scenario: State types compile
    Tool: Bash
    Steps:
      1. bunx tsc --noEmit
      2. Assert: 0 errors
    Expected Result: Clean compile
    Evidence: .sisyphus/evidence/task-3-tsc.txt
  ```

  **Commit**: YES (group with T1, T2)
  - Message: `feat(lokasi): tambah resolver lokasi Pasarjaya + data referensi`
  - Files: `src/state.ts`, `src/wa.ts` (clearTransientSessionContext only)

---

- [x] 4. Wire INPUT_MANUAL_LOCATION di wa.ts

  **What to do**:
  - Modifikasi handler `INPUT_MANUAL_LOCATION` (wa.ts:3579+):
    - Setelah capture `lokasiName = rawTrim` (line 3587), panggil resolver:
      ```
      const { resolveLocation, MAX_CANDIDATES } = await import('./services/locationResolver');
      const matches = resolveLocation(lokasiName);
      ```
    - **0 match**: `replyText = '❌ Lokasi "{lokasiName}" tidak ditemukan di database Pasarjaya.\n\nSilakan ketik ulang nama lokasi yang lebih spesifik, atau ketik 0 untuk batal.'` — state tetap `INPUT_MANUAL_LOCATION`
    - **1 match**: langsung pakai — `userSpecificLocationChoice.set(senderPhone, 'PASARJAYA - ${matches[0].nama}')` — lanjut processing seperti sekarang
    - **2-10 match**: tampilkan daftar bernomor dengan wilayah — `pendingLocationCandidates.set(senderPhone, matches)` — state → `INPUT_MANUAL_LOCATION_CONFIRM`
    - **>10 match**: `replyText = '⚠️ Ditemukan {matches.length} lokasi yang cocok. Coba ketik nama lokasi yang lebih spesifik.\n\nKetik 0 untuk batal.'` — state tetap `INPUT_MANUAL_LOCATION`
  - Format daftar kandidat:
    ```
    📍 Ditemukan {N} lokasi yang cocok:

    1. [Jakarta Pusat] Gerai Pasar Tanah Abang Blok G
    2. [Jakarta Timur] Jakmart KGN
    ...

    Balas dengan angka pilihanmu (1-{N}), atau ketik 0 untuk batal.
    ```
  - Tambah handler baru `INPUT_MANUAL_LOCATION_CONFIRM`:
    - Cek `isProviderBlocked('PASARJAYA')` di awal — jika blocked, redirect ke SELECT_LOCATION
    - Ambil candidates dari `pendingLocationCandidates.get(senderPhone)`
    - Jika tidak ada candidates (stale/restart): `replyText = '❌ Sesi kedaluwarsa. Silakan ketik ulang nama lokasi.'` → state `INPUT_MANUAL_LOCATION`
    - `0` → cancel, cleanup, kembali ke `SELECT_PASARJAYA_SUB`
    - Angka valid (1-N) → `userSpecificLocationChoice.set(senderPhone, 'PASARJAYA - ${candidates[idx].nama}')` → lanjut processing
    - Input invalid → `replyText = '❌ Pilihan tidak valid. Balas angka 1-{N} atau ketik 0 untuk batal.'`
  - Tambah `INPUT_MANUAL_LOCATION_CONFIRM` ke `skipDataValidation` guard (wa.ts:2817)
  - Tambah `'INPUT_MANUAL_LOCATION_CONFIRM'` ke 0-escape prevention guard jika perlu

  **Must NOT do**:
  - JANGAN ubah processing pipeline setelah `userSpecificLocationChoice.set()` (line 3602+)
  - JANGAN inline algorithm logic — hanya panggil `resolveLocation()`
  - JANGAN modifikasi PASARJAYA_MAPPING atau opsi 1-4

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5)
  - **Parallel Group**: Wave 2 (with T5)
  - **Blocks**: T7
  - **Blocked By**: T2, T3

  **References**:
  - `src/wa.ts:3579-3670` — current INPUT_MANUAL_LOCATION handler (full block)
  - `src/wa.ts:2817` — skipDataValidation guard
  - `src/wa.ts:2826` — exemption check
  - `src/wa.ts:3836` — 0-escape prevention guard
  - `src/wa.ts:1184` — clearTransientSessionContext
  - `src/services/locationResolver.ts` — resolver (from T2)
  - `src/state.ts` — pendingLocationCandidates Map (from T3)
  - `src/wa.ts:3431-3434` — option 5 entry point (sets INPUT_MANUAL_LOCATION)

  **Acceptance Criteria**:
  - [ ] 0 match → pesan error + tetap di INPUT_MANUAL_LOCATION
  - [ ] 1 match → langsung simpan nama resmi + lanjut processing
  - [ ] 2-10 match → daftar bernomor + state CONFIRM
  - [ ] >10 match → tolak + minta spesifik
  - [ ] CONFIRM: angka valid → simpan + lanjut
  - [ ] CONFIRM: angka invalid → error + tetap di CONFIRM
  - [ ] CONFIRM: 0 → cancel + kembali ke SELECT_PASARJAYA_SUB
  - [ ] CONFIRM: stale candidates → "sesi kedaluwarsa"
  - [ ] CONFIRM: provider blocked → redirect
  - [ ] skipDataValidation includes INPUT_MANUAL_LOCATION_CONFIRM
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:
  ```
  Scenario: Single match — langsung simpan
    Tool: Bash (bun eval / code review)
    Steps:
      1. Trace code path: INPUT_MANUAL_LOCATION + input "tanah abang"
      2. resolveLocation returns 1 match
      3. Assert: userSpecificLocationChoice set to "PASARJAYA - Gerai Pasar Tanah Abang Blok G"
    Expected Result: Nama resmi tersimpan, processing lanjut
    Evidence: .sisyphus/evidence/task-4-single-match.txt

  Scenario: Multiple match — daftar kandidat
    Tool: Bash (code review)
    Steps:
      1. Trace: INPUT_MANUAL_LOCATION + input "jakmart"
      2. resolveLocation returns 5+ matches
      3. Assert: replyText contains numbered list with [wilayah]
      4. Assert: state = INPUT_MANUAL_LOCATION_CONFIRM
      5. Assert: pendingLocationCandidates has entries
    Expected Result: Daftar bernomor ditampilkan
    Evidence: .sisyphus/evidence/task-4-multi-match.txt

  Scenario: No match — minta ketik ulang
    Tool: Bash (code review)
    Steps:
      1. Trace: INPUT_MANUAL_LOCATION + input "xyzabc"
      2. resolveLocation returns []
      3. Assert: replyText contains "tidak ditemukan"
      4. Assert: state tetap INPUT_MANUAL_LOCATION
    Expected Result: Error message, user bisa retry
    Evidence: .sisyphus/evidence/task-4-no-match.txt

  Scenario: Overflow >10 — tolak
    Tool: Bash (code review)
    Steps:
      1. Trace: INPUT_MANUAL_LOCATION + input "mini" (banyak Mini DC)
      2. resolveLocation returns >10 matches
      3. Assert: replyText contains "lebih spesifik"
      4. Assert: state tetap INPUT_MANUAL_LOCATION
    Expected Result: Tolak, minta spesifik
    Evidence: .sisyphus/evidence/task-4-overflow.txt
  ```

  **Commit**: YES
  - Message: `feat(lokasi): wire fuzzy matching di flow Lokasi Lain + Edit`
  - Files: `src/wa.ts`

- [x] 5. Wire EDIT_INPUT_MANUAL_LOCATION di wa.ts

  **What to do**:
  - Modifikasi handler `EDIT_INPUT_MANUAL_LOCATION` (wa.ts:2588+):
    - Sama seperti T4 tapi untuk edit flow
    - Setelah capture `rawTrim`, panggil `resolveLocation(rawTrim)`
    - **0 match**: error + tetap di EDIT_INPUT_MANUAL_LOCATION
    - **1 match**: `session.newValue = 'PASARJAYA - ${matches[0].nama}'` → lanjut ke confirmation
    - **2-10 match**: daftar + state → EDIT_INPUT_MANUAL_LOCATION_CONFIRM
    - **>10 match**: tolak + minta spesifik
  - Tambah handler `EDIT_INPUT_MANUAL_LOCATION_CONFIRM`:
    - Ambil candidates dari pendingLocationCandidates
    - Stale → "sesi kedaluwarsa" → kembali ke EDIT_PICK_FIELD
    - 0 → cancel → kembali ke EDIT_PICK_FIELD
    - Angka valid → `session.newValue = 'PASARJAYA - ${candidates[idx].nama}'` → lanjut ke edit confirmation
    - Invalid → error
  - Tambah `EDIT_INPUT_MANUAL_LOCATION_CONFIRM` ke `skipDataValidation` guard

  **Must NOT do**:
  - JANGAN ubah edit confirmation/save logic setelah `session.newValue` di-set
  - JANGAN ubah flow edit untuk provider lain (Dharmajaya, Food Station)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4)
  - **Parallel Group**: Wave 2 (with T4)
  - **Blocks**: T7
  - **Blocked By**: T2, T3

  **References**:
  - `src/wa.ts:2588+` — EDIT_INPUT_MANUAL_LOCATION handler
  - `src/wa.ts:2817` — skipDataValidation guard
  - T4 implementation — same pattern, different handler

  **Acceptance Criteria**:
  - [ ] Edit flow: 0 match → error + retry
  - [ ] Edit flow: 1 match → langsung set newValue
  - [ ] Edit flow: 2-10 match → daftar + CONFIRM state
  - [ ] Edit flow: >10 match → tolak
  - [ ] Edit CONFIRM: angka valid → set newValue + lanjut
  - [ ] Edit CONFIRM: 0 → cancel
  - [ ] skipDataValidation includes EDIT_INPUT_MANUAL_LOCATION_CONFIRM
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:
  ```
  Scenario: Edit flow single match
    Tool: Bash (code review)
    Steps:
      1. Trace: EDIT_INPUT_MANUAL_LOCATION + input "tanah abang"
      2. Assert: session.newValue = "PASARJAYA - Gerai Pasar Tanah Abang Blok G"
    Expected Result: Nama resmi di-set ke newValue
    Evidence: .sisyphus/evidence/task-5-edit-single.txt

  Scenario: Edit flow disambiguation
    Tool: Bash (code review)
    Steps:
      1. Trace: EDIT_INPUT_MANUAL_LOCATION + input "jakmart"
      2. Assert: daftar bernomor + state EDIT_INPUT_MANUAL_LOCATION_CONFIRM
    Expected Result: Daftar kandidat ditampilkan
    Evidence: .sisyphus/evidence/task-5-edit-multi.txt
  ```

  **Commit**: YES (group with T4)
  - Message: `feat(lokasi): wire fuzzy matching di flow Lokasi Lain + Edit`
  - Files: `src/wa.ts`

---

- [x] 6. Unit Test locationResolver.ts

  **What to do**:
  - Buat `src/tests/locationResolver.test.ts`
  - Test cases:
    1. LOCATION_INDEX punya 97 entries
    2. Single match — full phrase ("tanah abang" → 1 result)
    3. Multiple match — full phrase ("jakmart" → multiple)
    4. Exact match tiebreaker ("pasar senen" exact vs "pasar senen blok III" substring)
    5. No-space match ("tanahabang" → match)
    6. No-space skip short input ("dc" → skip stage 2)
    7. Token fallback with stopwords ("jl pasar di senen" → filters jl, di)
    8. All stopwords → empty ("di jalan kec" → [])
    9. Token < 3 chars filtered ("ab cd" → no tokens → [])
    10. No match ("xyzabc123" → [])
    11. Case insensitive ("KEDOYA" matches "Jakgrosir Kedoya")
    12. Entry has all fields (kode, nama, wilayah, wilayahNama, normalized, normalizedNospace)

  **Recommended Agent Profile**:
  - **Category**: `implementation`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7)
  - **Parallel Group**: Wave 3 (with T7)
  - **Blocks**: None
  - **Blocked By**: T2

  **References**:
  - `src/services/locationResolver.ts` — module under test
  - `src/tests/locationGate.test.ts` — existing test pattern (mock + dynamic import)
  - `src/tests/helpers.ts` — mock factories

  **Acceptance Criteria**:
  - [ ] 12+ test cases pass
  - [ ] `bun test src/tests/locationResolver.test.ts` → all pass
  - [ ] Full suite `bun test --isolate` → 0 new failures

  **QA Scenarios**:
  ```
  Scenario: All resolver tests pass
    Tool: Bash
    Steps:
      1. bun test src/tests/locationResolver.test.ts
      2. Assert: all pass, 0 fail
    Expected Result: 12+ tests pass
    Evidence: .sisyphus/evidence/task-6-unit-tests.txt
  ```

  **Commit**: YES
  - Message: `test(lokasi): unit + integration test location resolver`
  - Files: `src/tests/locationResolver.test.ts`

- [x] 7. Integration Test — Full Flow

  **What to do**:
  - Buat `src/tests/locationResolver-integration.test.ts`
  - Test scenarios:
    1. Flow: input "kedoya" → 1 match → simpan "PASARJAYA - Jakgrosir Kedoya" (nama resmi)
    2. Flow: input "jakmart" → multiple → daftar → pilih angka → simpan nama resmi
    3. Flow: input "xyzabc" → no match → error → retry → "kedoya" → sukses
    4. Flow: input "pasar" → >10 match → tolak → retry "pasar senen" → sukses
    5. Flow: disambiguation → 0 → cancel
    6. Flow: disambiguation → invalid angka → error → valid angka → sukses
  - Mock `resolveLocation` dan `pendingLocationCandidates` untuk isolasi

  **Recommended Agent Profile**:
  - **Category**: `implementation`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6)
  - **Parallel Group**: Wave 3 (with T6)
  - **Blocks**: None
  - **Blocked By**: T4, T5

  **References**:
  - `src/tests/integration-location.test.ts` — existing integration test pattern
  - `src/tests/statusCheck-multiProvider.test.ts` — another integration pattern

  **Acceptance Criteria**:
  - [ ] 6+ integration test cases pass
  - [ ] Full suite `bun test --isolate` → 0 new failures

  **QA Scenarios**:
  ```
  Scenario: All integration tests pass
    Tool: Bash
    Steps:
      1. bun test src/tests/locationResolver-integration.test.ts
      2. Assert: all pass, 0 fail
    Expected Result: 6+ tests pass
    Evidence: .sisyphus/evidence/task-7-integration-tests.txt
  ```

  **Commit**: YES (group with T6)
  - Message: `test(lokasi): unit + integration test location resolver`
  - Files: `src/tests/locationResolver-integration.test.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `review`
  Run `tsc --noEmit` + `bun test --isolate`. Review all changed files for anti-patterns.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `testing`
  Execute EVERY QA scenario from EVERY task. Test cross-task integration.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read spec, read actual diff. Verify 1:1 compliance.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files |
|------|---------------|-------|
| 1 | `feat(lokasi): tambah resolver lokasi Pasarjaya + data referensi` | locations-pasarjaya.json, locationResolver.ts, state.ts |
| 2 | `feat(lokasi): wire fuzzy matching di flow Lokasi Lain + Edit` | wa.ts |
| 3 | `test(lokasi): unit + integration test location resolver` | locationResolver.test.ts, integration test |

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit          # Expected: 0 errors
bun test --isolate         # Expected: all pass, 0 fail
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated
