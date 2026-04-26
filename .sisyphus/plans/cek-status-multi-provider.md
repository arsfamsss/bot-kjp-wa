# Cek Status Pendaftaran Multi-Provider

## TL;DR

> **Ringkasan**: Extend menu user opsi 5 "Cek Status Pendaftaran" dari Dharmajaya-only ke 3 provider (Dharmajaya, Pasarjaya, Food Station) dengan sub-menu dinamis, porting logic dari script eksternal, text-only output.
>
> **Deliverables**:
> - Sub-menu provider dinamis (hide provider tutup) saat user ketik 5
> - Jam operasional cek status per-provider (Dharmajaya 06:05, Pasarjaya 07:10, Food Station 16:10 — s/d 23:59)
> - Service `pasarjayaStatusCheck.ts` — CSRF + cookie + HTML parse
> - Service `foodStationStatusCheck.ts` — POST + parse response
> - Extend `resolveStatusSourceItems` untuk carry `lokasi` + `tanggal_lahir` + filter by provider
> - Format output per-provider (sukses + gagal + copy-paste data gagal)
> - Unit tests untuk kedua service baru + integration test
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 → T3/T4 → T6 → T7 → T8

---

## Context

### Original Request
User minta extend menu "Cek Status Pendaftaran" (opsi 5) agar support 3 provider, bukan hanya Dharmajaya. Logic Pasarjaya dan Food Station sudah ada di script JS terpisah, perlu di-port ke TypeScript dan diintegrasikan ke bot WA.

### Interview Summary
**Key Discussions**:
- Flow: ketik 5 → sub-menu pilih provider (1/2/3) → auto-cek data kemarin
- Dharmajaya: JANGAN UBAH logika/alur yang sudah ada
- Sub-menu provider: DYNAMIC — hide provider yang ditutup (isProviderBlocked)
- Pasarjaya identifier: no_kjp SAJA (tidak fallback ke ktp/kk)
- Food Station identifier: NIK (no_ktp)
- Output sukses Pasarjaya: Nama, Status, Lokasi, Tgl Pengambilan, No Urut
- Output sukses Food Station: status berhasil/gagal saja
- Data gagal Pasarjaya: Nama, KJP, KTP, KK + Tgl Lahir (DDMMYYYY)
- Data gagal Food Station: Nama, KJP, KTP, KK (sama Dharmajaya)
- Tanpa foto/screenshot — TEXT ONLY
- Jam operasional cek status: Dharmajaya 06:05-23:59, Pasarjaya 07:10-23:59, Food Station 16:10-23:59
- Di luar jam → tolak langsung + pesan jam operasional
- Konfigurasi jam: hardcode di config (messages.ts)

**Research Findings**:
- `resolveStatusSourceItems` (wa.ts:1914) STRIPS `lokasi` dan `tanggal_lahir` — perlu extend
- `getTodayRecapForSender` (recap.ts) sudah SELECT `lokasi` dan `tanggal_lahir` dari DB
- `tanggal_lahir` stored as `YYYY-MM-DD`, perlu convert ke `DDMMYYYY` untuk Pasarjaya gagal
- Provider bisa di-derive dari field `lokasi` (e.g. `PASARJAYA - Jakgrosir` → `PASARJAYA`)
- Pasarjaya script: CSRF + cookie + redirect follow + HTML parse (complex)
- Food Station script: simple POST + body check (straightforward)

### Metis Review
**Identified Gaps** (addressed):
- `resolveStatusSourceItems` perlu carry `lokasi` + `tanggal_lahir` untuk filtering + Pasarjaya gagal format
- CSRF failure handling untuk Pasarjaya (retry + clear error message)
- Provider filtering dari `lokasi` field — derive provider key dari prefix
- Dynamic sub-menu harus show semua open provider, clear message jika tidak ada data
- Scope locks: no generic retry framework, no puppeteer, no Telegram, no photo

---

## Work Objectives

### Core Objective
Extend cek status pendaftaran dari Dharmajaya-only ke 3 provider dengan sub-menu dinamis dan output text-only per-provider.

### Concrete Deliverables
- `src/services/pasarjayaStatusCheck.ts` — service cek status Pasarjaya
- `src/services/foodStationStatusCheck.ts` — service cek status Food Station
- Modified `resolveStatusSourceItems` di wa.ts — carry `lokasi` + `tanggal_lahir`, filter by provider
- Modified `StatusCheckItem` interface — tambah `lokasi?` + `tanggal_lahir?`
- Sub-menu provider di wa.ts (state `CHECK_STATUS_SELECT_PROVIDER`)
- Format output per-provider (summary + failed data copy)
- Unit tests: `pasarjayaStatusCheck.test.ts`, `foodStationStatusCheck.test.ts`
- Integration test: `statusCheck-multiProvider.test.ts`

### Definition of Done
- [ ] User ketik 5 → muncul sub-menu provider (dynamic, hide tutup)
- [ ] Pilih Dharmajaya → flow SAMA PERSIS seperti sekarang
- [ ] Pilih Pasarjaya → cek via CSRF+cookie, output text sukses/gagal
- [ ] Pilih Food Station → cek via POST, output text sukses/gagal
- [ ] Data gagal Pasarjaya include tanggal lahir DDMMYYYY
- [ ] `bun test` semua pass
- [ ] `tsc --noEmit` 0 error

### Must Have
- Sub-menu provider dinamis (hide provider tutup)
- Pasarjaya: CSRF + cookie + redirect follow + HTML parse
- Food Station: POST + body parse
- Filter data kemarin by provider/lokasi
- Text-only output (no foto)
- Data gagal copy-paste format per-provider
- Lock `statusCheckInProgressByPhone` tetap berfungsi

### Must NOT Have (Guardrails)
- JANGAN ubah logika/alur Dharmajaya yang sudah ada
- JANGAN kirim foto/screenshot QR
- JANGAN pakai puppeteer/playwright untuk scraping
- JANGAN buat generic retry framework — inline retry per-service
- JANGAN ubah `checkRegistrationStatuses` function signature
- JANGAN tambah dependency baru (pakai native `https` atau built-in `fetch`)
- JANGAN refactor wa.ts di luar scope cek status
- JANGAN merge cek status ke menu admin

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test sudah setup dari plan sebelumnya)
- **Automated tests**: Tests-after
- **Framework**: bun test (--isolate)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Service/Module**: Use Bash (bun REPL / direct import test) — import, call functions, compare output
- **API/External**: Use Bash (curl) — verify endpoint reachable, mock response handling

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + services):
├── T1: Extend StatusCheckItem + resolveStatusSourceItems [quick]
├── T2: Add CHECK_STATUS_SELECT_PROVIDER state to state.ts [quick]
├── T3: Create pasarjayaStatusCheck.ts service [deep]
└── T4: Create foodStationStatusCheck.ts service [unspecified-high]

Wave 2 (After Wave 1 — integration + formatting):
├── T5: Add status check message templates to messages.ts [quick]
├── T6: Wire sub-menu + provider routing in wa.ts [deep]
└── T7: Build per-provider format functions (summary + failed copy) [unspecified-high]

Wave 3 (After Wave 2 — tests):
├── T8: Unit tests pasarjayaStatusCheck + foodStationStatusCheck [implementation]
├── T9: Unit test format functions [implementation]
└── T10: Integration test multi-provider flow [implementation]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (review)
├── F3: Real manual QA (testing)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | - | T3, T4, T6, T7 | 1 |
| T2 | - | T6 | 1 |
| T3 | T1 | T6, T8 | 1 |
| T4 | T1 | T6, T8 | 1 |
| T5 | - | T6 | 2 |
| T6 | T1, T2, T3, T4, T5 | T10 | 2 |
| T7 | T1 | T6, T9 | 2 |
| T8 | T3, T4 | - | 3 |
| T9 | T7 | - | 3 |
| T10 | T6 | - | 3 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `quick`, T3 → `deep`, T4 → `unspecified-high`
- **Wave 2**: 3 tasks — T5 → `quick`, T6 → `deep`, T7 → `unspecified-high`
- **Wave 3**: 3 tasks — T8 → `implementation`, T9 → `implementation`, T10 → `implementation`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `review`, F3 → `testing`, F4 → `deep`

---

## TODOs

- [x] 1. Extend StatusCheckItem + resolveStatusSourceItems untuk Multi-Provider

  **What to do**:
  - Tambah field opsional ke `StatusCheckItem` interface di `src/services/statusCheckService.ts`:
    - `lokasi?: string` — lokasi dari DB (e.g. `PASARJAYA - Jakgrosir Kedoya`)
    - `tanggal_lahir?: string | null` — format `YYYY-MM-DD` dari DB
  - Modify `resolveStatusSourceItems` di `src/wa.ts` (~line 1914-1924):
    - Tambah parameter `providerFilter?: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION'`
    - Carry `lokasi` dan `tanggal_lahir` dari `validItems` ke output
    - Jika `providerFilter` diberikan, filter items berdasarkan prefix `lokasi` field
    - Provider derivation: `lokasi.startsWith('PASARJAYA')` → PASARJAYA, `lokasi.startsWith('DHARMAJAYA')` → DHARMAJAYA, else (termasuk `FOD STATION`) → FOOD_STATION
  - JANGAN ubah pemanggilan existing Dharmajaya — panggilan tanpa `providerFilter` harus tetap return SEMUA items (backward compatible)

  **Must NOT do**:
  - Jangan ubah `checkRegistrationStatuses` function
  - Jangan ubah `buildStatusSummaryMessage` atau `buildFailedDataCopyMessage`
  - Jangan hapus field existing dari `StatusCheckItem`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T3, T4, T6, T7
  - **Blocked By**: None

  **References**:
  - `src/services/statusCheckService.ts:62-68` — Current `StatusCheckItem` interface
  - `src/wa.ts:1914-1924` — Current `resolveStatusSourceItems` function
  - `src/recap.ts` — `getTodayRecapForSender` returns `validItems` with `lokasi` dan `tanggal_lahir`
  - `src/services/locationGate.ts:12` — `ProviderType` definition

  **Acceptance Criteria**:
  - [ ] `StatusCheckItem` punya field `lokasi?: string` dan `tanggal_lahir?: string | null`
  - [ ] `resolveStatusSourceItems()` tanpa filter → return SEMUA items (backward compat)
  - [ ] `resolveStatusSourceItems('PASARJAYA')` → hanya items dengan lokasi prefix `PASARJAYA`
  - [ ] Items yang di-return carry `lokasi` dan `tanggal_lahir` dari DB
  - [ ] `tsc --noEmit` 0 error

  **QA Scenarios**:
  ```
  Scenario: Backward compatibility — no filter returns all items
    Tool: Bash (bun eval)
    Steps:
      1. Import resolveStatusSourceItems (mock getTodayRecapForSender)
      2. Call without providerFilter
      3. Assert returns ALL items from validItems
    Expected Result: All items returned, each with lokasi + tanggal_lahir fields
    Evidence: .sisyphus/evidence/task-1-backward-compat.txt

  Scenario: Provider filter — only matching items returned
    Tool: Bash (bun eval)
    Steps:
      1. Mock validItems with mix of PASARJAYA, DHARMAJAYA, FOD STATION lokasi
      2. Call with providerFilter='PASARJAYA'
      3. Assert only PASARJAYA items returned
    Expected Result: Only items with lokasi starting with 'PASARJAYA' returned
    Evidence: .sisyphus/evidence/task-1-provider-filter.txt
  ```

  **Commit**: YES
  - Message: `feat(status): extend StatusCheckItem + resolveStatusSourceItems untuk multi-provider`
  - Files: `src/services/statusCheckService.ts`, `src/wa.ts`
  - Pre-commit: `bunx tsc --noEmit`

- [x] 2. Tambah State CHECK_STATUS_SELECT_PROVIDER di state.ts

  **What to do**:
  - Tambah `'CHECK_STATUS_SELECT_PROVIDER'` ke `AdminFlowState` type union ATAU `UserFlowState` type union di `src/state.ts`
  - Cek flow existing: cek status saat ini pakai `UserFlowState` (`CHECK_STATUS_PICK_ITEMS` sudah ada tapi legacy)
  - Tambah ke `UserFlowState` karena cek status adalah fitur USER (bukan admin)
  - Tambah juga `'CHECK_STATUS_PROCESSING'` jika belum ada (untuk lock state saat processing)

  **Must NOT do**:
  - Jangan hapus state existing
  - Jangan ubah state lain

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T6
  - **Blocked By**: None

  **References**:
  - `src/state.ts:7-24` — Current `UserFlowState` type union
  - `src/state.ts:11` — `CHECK_STATUS_PICK_ITEMS` (legacy, unreachable)
  - `src/wa.ts:6746-6796` — Current status check flow (uses `statusCheckInProgressByPhone` Map, not state)

  **Acceptance Criteria**:
  - [ ] `CHECK_STATUS_SELECT_PROVIDER` ada di `UserFlowState`
  - [ ] State existing tidak berubah
  - [ ] `tsc --noEmit` 0 error

  **QA Scenarios**:
  ```
  Scenario: State type compiles correctly
    Tool: Bash
    Steps:
      1. bunx tsc --noEmit
      2. Check exit code 0
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-2-tsc.txt
  ```

  **Commit**: YES (grouped with T1)
  - Message: `feat(status): extend StatusCheckItem + resolveStatusSourceItems untuk multi-provider`
  - Files: `src/state.ts`
  - Pre-commit: `bunx tsc --noEmit`

- [x] 3. Buat Service pasarjayaStatusCheck.ts

  **What to do**:
  - Buat file `src/services/pasarjayaStatusCheck.ts`
  - Port logic dari `D:\BOT\CEK STATUS DAN KIRIM QR PASARJAYA\cek_status_whatsapp.js` ke TypeScript
  - Implementasi flow:
    1. GET `https://antrianpanganbersubsidi.pasarjaya.co.id/cetak-qr` → extract cookie + CSRF token
    2. POST `/cetak-qr` body `_token=<csrf>&nomor=<no_kjp>` (form-urlencoded) dengan cookie
    3. Follow redirect (manual, bukan auto-redirect)
    4. Parse HTML response untuk detect sukses/gagal
  - CSRF extraction: cari `<input name="_token" value="...">` atau `<meta name="csrf-token" content="...">`
  - Cookie handling: merge Set-Cookie headers, kirim balik di subsequent requests
  - TLS: `rejectUnauthorized: false` (server Pasarjaya punya cert issue)
  - Sukses detection: body contains "NOMOR URUT" ATAU "REGISTRASI BERHASIL" ATAU "Cetak QR" ATAU redirect ke `/list-cetak` atau `/berhasil`
  - Gagal detection: body contains "tidak ditemukan" ATAU "data tidak ditemukan" ATAU "belum ada data"
  - Extract detail sukses via regex: lokasi, tanggal pengambilan, nomor urut
  - Retry: 3x dengan delay 2s (inline, bukan framework)
  - Timeout: 15s per request (configurable via env `PASARJAYA_STATUS_TIMEOUT_MS`)

  - Export interface + function:
    ```typescript
    export interface PasarjayaStatusResult {
      state: 'BERHASIL' | 'GAGAL' | 'ERROR';
      reason?: string;
      detail?: {
        lokasi?: string;
        tanggalPengambilan?: string;
        nomorUrut?: string;
      };
    }
    export async function checkPasarjayaStatus(noKjp: string): Promise<PasarjayaStatusResult>
    export async function checkPasarjayaStatuses(items: StatusCheckItem[]): Promise<PasarjayaStatusCheckResult[]>
    ```
  - `checkPasarjayaStatuses` = batch function yang loop items serial (sama pattern `checkRegistrationStatuses`)
  - Pakai native `https` module (BUKAN fetch — karena perlu disable TLS verify + manual redirect)

  **Must NOT do**:
  - Jangan pakai puppeteer/playwright
  - Jangan buat generic HTTP client
  - Jangan tambah dependency baru
  - Jangan kirim foto/screenshot

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4)
  - **Blocks**: T6, T8
  - **Blocked By**: T1 (needs extended StatusCheckItem)

  **References**:
  - `D:\BOT\CEK STATUS DAN KIRIM QR PASARJAYA\cek_status_whatsapp.js` — Source script to port (BACA SELURUH FILE INI)
  - `src/services/statusCheckService.ts:87-137` — `checkSingle` pattern (retry + timeout + abort)
  - `src/services/statusCheckService.ts:139-153` — `checkRegistrationStatuses` batch pattern (serial + gap)
  - `src/services/statusCheckService.ts:62-68` — `StatusCheckItem` interface (extended with lokasi + tanggal_lahir)

  **Acceptance Criteria**:
  - [ ] File `src/services/pasarjayaStatusCheck.ts` exists
  - [ ] Export `checkPasarjayaStatus(noKjp)` → `PasarjayaStatusResult`
  - [ ] Export `checkPasarjayaStatuses(items)` → batch results
  - [ ] CSRF extraction dari HTML
  - [ ] Cookie handling (merge Set-Cookie)
  - [ ] TLS verify disabled
  - [ ] Retry 3x dengan delay
  - [ ] Timeout configurable via env
  - [ ] `tsc --noEmit` 0 error

  **QA Scenarios**:
  ```
  Scenario: CSRF extraction from HTML
    Tool: Bash (bun eval)
    Steps:
      1. Import extractCsrfToken (jika di-export untuk testing)
      2. Pass sample HTML with <input name="_token" value="abc123">
      3. Assert returns "abc123"
    Expected Result: CSRF token extracted correctly
    Evidence: .sisyphus/evidence/task-3-csrf-extract.txt

  Scenario: Sukses detection from HTML body
    Tool: Bash (bun eval)
    Steps:
      1. Pass HTML body containing "NOMOR URUT" dan "REGISTRASI BERHASIL"
      2. Assert state = 'BERHASIL'
      3. Assert detail extracted (lokasi, tanggal, nomorUrut)
    Expected Result: State BERHASIL with detail fields populated
    Evidence: .sisyphus/evidence/task-3-sukses-detect.txt

  Scenario: Gagal detection from HTML body
    Tool: Bash (bun eval)
    Steps:
      1. Pass HTML body containing "data tidak ditemukan"
      2. Assert state = 'GAGAL'
    Expected Result: State GAGAL, no detail
    Evidence: .sisyphus/evidence/task-3-gagal-detect.txt

  Scenario: Timeout/error handling
    Tool: Bash (bun eval)
    Steps:
      1. Mock https.request to timeout
      2. Assert state = 'ERROR' after retries exhausted
    Expected Result: State ERROR with reason
    Evidence: .sisyphus/evidence/task-3-timeout.txt
  ```

  **Commit**: YES
  - Message: `feat(status): service cek status Pasarjaya (CSRF+cookie+HTML parse)`
  - Files: `src/services/pasarjayaStatusCheck.ts`
  - Pre-commit: `bunx tsc --noEmit`

- [x] 4. Buat Service foodStationStatusCheck.ts

  **What to do**:
  - Buat file `src/services/foodStationStatusCheck.ts`
  - Port logic dari `D:\BOT\CEK STATUS DAN KIRIM QR FOODSTATION\CekStatusFoodstation.js` ke TypeScript
  - Implementasi flow:
    1. POST `https://pmb.foodstation.co.id/KJPRegister/cetakUlang` body `nik=<no_ktp>` (form-urlencoded)
    2. Parse response body untuk detect sukses/gagal
  - Sukses detection: body contains `#capture-area` ATAU `Registration Success`
  - Gagal detection: body contains `Data NIK tidak ditemukan`
  - TIDAK extract detail (hanya status berhasil/gagal — API tidak return detail antrean)
  - Retry: 3x dengan delay 2s
  - Timeout: 15s per request (configurable via env `FOODSTATION_STATUS_TIMEOUT_MS`)

  - Export interface + function:
    ```typescript
    export interface FoodStationStatusResult {
      state: 'BERHASIL' | 'GAGAL' | 'ERROR';
      reason?: string;
    }
    export async function checkFoodStationStatus(nik: string): Promise<FoodStationStatusResult>
    export async function checkFoodStationStatuses(items: StatusCheckItem[]): Promise<FoodStationStatusCheckResult[]>
    ```
  - `checkFoodStationStatuses` = batch function, serial loop, gap antar request
  - Pakai native `https` module atau built-in `fetch` (Food Station tidak perlu disable TLS)

  **Must NOT do**:
  - Jangan extract detail dari response (API tidak support)
  - Jangan pakai puppeteer
  - Jangan tambah dependency baru

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3)
  - **Blocks**: T6, T8
  - **Blocked By**: T1 (needs extended StatusCheckItem)

  **References**:
  - `D:\BOT\CEK STATUS DAN KIRIM QR FOODSTATION\CekStatusFoodstation.js` — Source script to port (BACA SELURUH FILE INI)
  - `src/services/statusCheckService.ts:87-137` — `checkSingle` pattern (retry + timeout)
  - `src/services/statusCheckService.ts:139-153` — batch pattern
  - `src/services/statusCheckService.ts:62-68` — `StatusCheckItem` interface

  **Acceptance Criteria**:
  - [ ] File `src/services/foodStationStatusCheck.ts` exists
  - [ ] Export `checkFoodStationStatus(nik)` → `FoodStationStatusResult`
  - [ ] Export `checkFoodStationStatuses(items)` → batch results
  - [ ] Retry 3x dengan delay
  - [ ] Timeout configurable via env
  - [ ] `tsc --noEmit` 0 error

  **QA Scenarios**:
  ```
  Scenario: Sukses detection
    Tool: Bash (bun eval)
    Steps:
      1. Mock POST response with body containing "#capture-area"
      2. Assert state = 'BERHASIL'
    Expected Result: State BERHASIL
    Evidence: .sisyphus/evidence/task-4-sukses.txt

  Scenario: Gagal detection
    Tool: Bash (bun eval)
    Steps:
      1. Mock POST response with body containing "Data NIK tidak ditemukan"
      2. Assert state = 'GAGAL'
    Expected Result: State GAGAL
    Evidence: .sisyphus/evidence/task-4-gagal.txt

  Scenario: Error/timeout handling
    Tool: Bash (bun eval)
    Steps:
      1. Mock request to timeout after 15s
      2. Assert retries 3x then returns ERROR
    Expected Result: State ERROR with reason after 3 retries
    Evidence: .sisyphus/evidence/task-4-timeout.txt
  ```

  **Commit**: YES
  - Message: `feat(status): service cek status Food Station (POST+parse)`
  - Files: `src/services/foodStationStatusCheck.ts`
  - Pre-commit: `bunx tsc --noEmit`

- [x] 5. Tambah Template Pesan Status Check di messages.ts

  **What to do**:
  - Tambah ke `src/config/messages.ts`:
    - `STATUS_CHECK_HOURS` — config jam operasional per-provider (hardcode):
      ```typescript
      export const STATUS_CHECK_HOURS: Record<string, { startHour: number; startMinute: number; endHour: number; endMinute: number; label: string }> = {
        DHARMAJAYA:   { startHour: 6,  startMinute: 5,  endHour: 23, endMinute: 59, label: '06:05' },
        PASARJAYA:    { startHour: 7,  startMinute: 10, endHour: 23, endMinute: 59, label: '07:10' },
        FOOD_STATION: { startHour: 16, startMinute: 10, endHour: 23, endMinute: 59, label: '16:10' },
      };
      ```
    - `isStatusCheckOpen(provider: string): boolean` — cek apakah sekarang dalam jam operasional (pakai `getWibParts()` dari time.ts)
    - `getStatusCheckClosedMessage(provider: string): string` — pesan tolak: "⏰ Cek status {provider} bisa dilakukan mulai jam {label} WIB s/d 23:59 WIB"
    - `STATUS_CHECK_PROVIDER_MENU` — async function (sama pattern `buildFormatDaftarMessage`) yang:
      - Cek `isProviderBlocked` untuk 3 provider
      - Cek `isStatusCheckOpen` untuk 3 provider
      - Build menu dinamis: hanya tampilkan provider yang buka DAN dalam jam operasional
      - Provider di luar jam: tampilkan tapi dengan keterangan "(buka jam {label})" dan TETAP bisa dipilih — tolak saat dipilih dengan pesan jam
      - Jika semua tutup: return pesan "semua lokasi tutup"
    - `getStatusCheckProviderMapping()` — return `Map<string, string>` mapping nomor dinamis ke provider key (sama pattern `getActiveProviderMapping`)
    - `STATUS_CHECK_NO_DATA_TEXT` — template "Tidak ada data pendaftaran kemarin untuk {provider}"
    - `STATUS_CHECK_PROCESSING_TEXT` — template "⏳ Sedang mengecek status pendaftaran {provider}..."
  - Reuse pattern dari `buildFormatDaftarMessage` dan `getActiveProviderMapping` yang sudah ada

  **Must NOT do**:
  - Jangan ubah template existing
  - Jangan hardcode provider list (pakai dynamic check)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T7)
  - **Blocks**: T6
  - **Blocked By**: None

  **References**:
  - `src/config/messages.ts:26+` — `buildFormatDaftarMessage` pattern; `getActiveProviderMapping` at ~line 80
  - `src/services/locationGate.ts:12` — `ProviderType`
  - `src/supabase.ts` — `isProviderBlocked`

  **Acceptance Criteria**:
  - [ ] `STATUS_CHECK_HOURS` config exists dengan jam per-provider
  - [ ] `isStatusCheckOpen(provider)` return boolean berdasarkan WIB time
  - [ ] `getStatusCheckClosedMessage(provider)` return pesan tolak dengan jam
  - [ ] `STATUS_CHECK_PROVIDER_MENU` function exists dan return menu dinamis
  - [ ] `getStatusCheckProviderMapping()` return Map dengan nomor dinamis
  - [ ] Provider tutup di-hide dari menu
  - [ ] `tsc --noEmit` 0 error

  **QA Scenarios**:
  ```
  Scenario: Dynamic menu hides closed providers
    Tool: Bash (bun eval)
    Steps:
      1. Mock isProviderBlocked: DHARMAJAYA=false, PASARJAYA=true, FOOD_STATION=false
      2. Call STATUS_CHECK_PROVIDER_MENU()
      3. Assert menu shows Dharmajaya (1) dan Food Station (2), NOT Pasarjaya
    Expected Result: Only open providers shown with correct numbering
    Evidence: .sisyphus/evidence/task-5-dynamic-menu.txt

  Scenario: Operating hours check
    Tool: Bash (bun eval)
    Steps:
      1. Mock getWibParts to return hour=5, minute=0 (before all providers open)
      2. Call isStatusCheckOpen('DHARMAJAYA') → assert false
      3. Mock getWibParts to return hour=6, minute=10
      4. Call isStatusCheckOpen('DHARMAJAYA') → assert true
      5. Call isStatusCheckOpen('PASARJAYA') → assert false (opens 07:10)
    Expected Result: Correct open/closed per provider based on WIB time
    Evidence: .sisyphus/evidence/task-5-operating-hours.txt
  ```

  **Commit**: YES (grouped with T6)
  - Message: `feat(status): sub-menu provider + routing + format output multi-provider`
  - Files: `src/config/messages.ts`

- [x] 6. Wire Sub-Menu Provider + Routing di wa.ts

  **What to do**:
  - Modify handler opsi 5 di `src/wa.ts` (~line 6746-6796):
    - Saat user ketik `'5'`, `'STATUS'`, `'CEK STATUS'`, dll:
      - JANGAN langsung jalankan Dharmajaya check
      - Tampilkan sub-menu provider (dari `STATUS_CHECK_PROVIDER_MENU`)
      - Set state ke `CHECK_STATUS_SELECT_PROVIDER`
    - Handler `CHECK_STATUS_SELECT_PROVIDER`:
      - Parse input user (1/2/3) via `getStatusCheckProviderMapping()`
      - Map ke provider key
      - Jika `'0'` → kembali ke menu utama
      - Jika invalid → tampilkan ulang menu
      - Jika valid provider:
        - Cek `isStatusCheckOpen(providerKey)` — jika di luar jam → kirim `getStatusCheckClosedMessage(providerKey)`, tetap di state `CHECK_STATUS_SELECT_PROVIDER`
        - Call `resolveStatusSourceItems(sourceDateDefault, providerKey)` dengan filter
        - Jika tidak ada data → kirim `STATUS_CHECK_NO_DATA_TEXT`
        - Jika ada data:
          - **DHARMAJAYA**: panggil `checkRegistrationStatuses` (EXISTING, jangan ubah)
          - **PASARJAYA**: panggil `checkPasarjayaStatuses` dari service baru
          - **FOOD_STATION**: panggil `checkFoodStationStatuses` dari service baru
        - Format output sesuai provider (T7)
        - Kirim summary + failed data copy
  - Lock `statusCheckInProgressByPhone` tetap berfungsi untuk semua provider
  - Dynamic import untuk service baru (hindari circular dependency):
    ```typescript
    const { checkPasarjayaStatuses } = await import('./services/pasarjayaStatusCheck');
    const { checkFoodStationStatuses } = await import('./services/foodStationStatusCheck');
    ```
  - Tambah `CHECK_STATUS_SELECT_PROVIDER` ke 0-escape prevention jika perlu

  **Must NOT do**:
  - JANGAN ubah logika Dharmajaya `checkRegistrationStatuses`
  - JANGAN ubah `buildStatusSummaryMessage` atau `buildFailedDataCopyMessage`
  - JANGAN refactor wa.ts di luar scope cek status
  - JANGAN hapus trigger keywords existing ('5', 'STATUS', dll)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after T1-T5)
  - **Blocks**: T10
  - **Blocked By**: T1, T2, T3, T4, T5

  **References**:
  - `src/wa.ts:6746-6796` — Current status check handler (BACA SELURUH BLOK INI)
  - `src/wa.ts:1914-1924` — `resolveStatusSourceItems` (extended di T1)
  - `src/wa.ts:3830-3849` — 0-escape prevention pattern
  - `src/config/messages.ts` — `STATUS_CHECK_PROVIDER_MENU`, `getStatusCheckProviderMapping` (T5)
  - `src/services/pasarjayaStatusCheck.ts` — `checkPasarjayaStatuses` (T3)
  - `src/services/foodStationStatusCheck.ts` — `checkFoodStationStatuses` (T4)
  - `src/services/statusCheckService.ts:139-153` — `checkRegistrationStatuses` (existing Dharmajaya)
  - `src/state.ts` — `CHECK_STATUS_SELECT_PROVIDER` (T2)

  **Acceptance Criteria**:
  - [ ] User ketik 5 → muncul sub-menu provider (dynamic)
  - [ ] Pilih provider di luar jam → tolak + pesan jam operasional, tetap di sub-menu
  - [ ] Pilih Dharmajaya (dalam jam) → flow SAMA PERSIS seperti sekarang
  - [ ] Pilih Pasarjaya (dalam jam) → call `checkPasarjayaStatuses`
  - [ ] Pilih Food Station (dalam jam) → call `checkFoodStationStatuses`
  - [ ] Ketik 0 → kembali ke menu utama
  - [ ] Invalid input → tampilkan ulang menu
  - [ ] Lock `statusCheckInProgressByPhone` berfungsi
  - [ ] `tsc --noEmit` 0 error

  **QA Scenarios**:
  ```
  Scenario: Sub-menu appears on trigger
    Tool: Bash (grep)
    Steps:
      1. Grep wa.ts for CHECK_STATUS_SELECT_PROVIDER state handling
      2. Verify state transition from trigger keywords to sub-menu
    Expected Result: State set to CHECK_STATUS_SELECT_PROVIDER, menu sent
    Evidence: .sisyphus/evidence/task-6-submenu.txt

  Scenario: Dharmajaya routing unchanged
    Tool: Bash (grep)
    Steps:
      1. Verify checkRegistrationStatuses still called for Dharmajaya
      2. Verify buildStatusSummaryMessage still used
    Expected Result: Dharmajaya path identical to before
    Evidence: .sisyphus/evidence/task-6-dharmajaya-unchanged.txt

  Scenario: Provider routing correct
    Tool: Bash (grep)
    Steps:
      1. Verify checkPasarjayaStatuses imported and called for PASARJAYA
      2. Verify checkFoodStationStatuses imported and called for FOOD_STATION
    Expected Result: Each provider routes to correct service
    Evidence: .sisyphus/evidence/task-6-routing.txt
  ```

  **Commit**: YES
  - Message: `feat(status): sub-menu provider + routing + format output multi-provider`
  - Files: `src/wa.ts`, `src/config/messages.ts`
  - Pre-commit: `bunx tsc --noEmit`

- [x] 7. Build Per-Provider Format Functions (Summary + Failed Copy)

  **What to do**:
  - Tambah functions ke `src/services/statusCheckService.ts` (atau buat file baru `src/services/statusCheckFormatter.ts` jika terlalu besar):
  
  - **Pasarjaya Summary** — `buildPasarjayaStatusSummary(results, sourceDate)`:
    - Header: "📋 *LAPORAN HASIL PENDAFTARAN PASARJAYA {date}*"
    - Sukses: "✅ {nama} — BERHASIL\n   📍 Lokasi: {lokasi}\n   📅 Tgl Pengambilan: {tanggal}\n   🔢 No Urut: {nomorUrut}"
    - Gagal: "❌ {nama} — Belum terdaftar"
    - Error: "⚠️ {nama} — Sedang ada kendala"
  
  - **Pasarjaya Failed Copy** — `buildPasarjayaFailedCopy(results)`:
    - Format: `{nama}\nKJP {no_kjp}\nKTP {no_ktp}\nKK {no_kk}\n{tanggal_lahir_DDMMYYYY}`
    - `tanggal_lahir` convert dari `YYYY-MM-DD` ke `DDMMYYYY` (strip dashes, reverse)
    - Jika `tanggal_lahir` null/undefined → skip baris tgl lahir
  
  - **Food Station Summary** — `buildFoodStationStatusSummary(results, sourceDate)`:
    - Header: "📋 *LAPORAN HASIL PENDAFTARAN FOOD STATION {date}*"
    - Sukses: "✅ {nama} — BERHASIL"
    - Gagal: "❌ {nama} — Belum terdaftar"
    - Error: "⚠️ {nama} — Sedang ada kendala"
  
  - **Food Station Failed Copy** — `buildFoodStationFailedCopy(results)`:
    - Format: `{nama}\nKJP {no_kjp}\nKTP {no_ktp}\nKK {no_kk}` (sama Dharmajaya, tanpa tgl lahir)
  
  - **Dharmajaya**: JANGAN BUAT function baru — tetap pakai `buildStatusSummaryMessage` + `buildFailedDataCopyMessage` yang sudah ada

  **Must NOT do**:
  - Jangan ubah `buildStatusSummaryMessage` atau `buildFailedDataCopyMessage`
  - Jangan tambah foto/screenshot ke output

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T5, T6)
  - **Blocks**: T9
  - **Blocked By**: T1 (needs extended StatusCheckItem with tanggal_lahir)

  **References**:
  - `src/services/statusCheckService.ts:155-230` — Existing `buildStatusSummaryMessage` + `buildFailedDataCopyMessage` (pattern to follow)
  - `src/services/statusCheckService.ts:62-68` — Extended `StatusCheckItem` (with lokasi + tanggal_lahir)
  - Draft decisions: Pasarjaya gagal = Nama, KJP, KTP, KK + Tgl Lahir (DDMMYYYY); Food Station gagal = Nama, KJP, KTP, KK

  **Acceptance Criteria**:
  - [ ] `buildPasarjayaStatusSummary` exists dan format correct
  - [ ] `buildPasarjayaFailedCopy` includes tanggal_lahir DDMMYYYY
  - [ ] `buildFoodStationStatusSummary` exists
  - [ ] `buildFoodStationFailedCopy` format sama Dharmajaya (tanpa tgl lahir)
  - [ ] `tanggal_lahir` YYYY-MM-DD → DDMMYYYY conversion correct
  - [ ] `tsc --noEmit` 0 error

  **QA Scenarios**:
  ```
  Scenario: Pasarjaya failed copy includes tanggal lahir DDMMYYYY
    Tool: Bash (bun eval)
    Steps:
      1. Create mock results with tanggal_lahir='2015-03-25'
      2. Call buildPasarjayaFailedCopy
      3. Assert output contains '25032015'
    Expected Result: Tanggal lahir converted to DDMMYYYY format
    Evidence: .sisyphus/evidence/task-7-pasarjaya-tgl-lahir.txt

  Scenario: Food Station failed copy same as Dharmajaya (no tgl lahir)
    Tool: Bash (bun eval)
    Steps:
      1. Create mock results
      2. Call buildFoodStationFailedCopy
      3. Assert output has Nama, KJP, KTP, KK — NO tanggal lahir
    Expected Result: Format matches Dharmajaya pattern without tgl lahir
    Evidence: .sisyphus/evidence/task-7-foodstation-format.txt

  Scenario: Pasarjaya summary shows detail (lokasi, tgl, no urut)
    Tool: Bash (bun eval)
    Steps:
      1. Create mock BERHASIL result with detail {lokasi, tanggalPengambilan, nomorUrut}
      2. Call buildPasarjayaStatusSummary
      3. Assert output contains all 3 detail fields
    Expected Result: Summary includes lokasi, tanggal pengambilan, nomor urut
    Evidence: .sisyphus/evidence/task-7-pasarjaya-detail.txt
  ```

  **Commit**: YES (grouped with T6)
  - Message: `feat(status): sub-menu provider + routing + format output multi-provider`
  - Files: `src/services/statusCheckService.ts` (or `statusCheckFormatter.ts`)

- [x] 8. Unit Tests: pasarjayaStatusCheck + foodStationStatusCheck

  **What to do**:
  - Buat `src/tests/pasarjayaStatusCheck.test.ts`:
    - Mock `https.request` (atau fetch) untuk simulate responses
    - Test CSRF extraction dari sample HTML
    - Test sukses detection (body with "NOMOR URUT")
    - Test gagal detection (body with "tidak ditemukan")
    - Test error/timeout handling (3 retries exhausted)
    - Test detail extraction (lokasi, tanggal, nomorUrut)
    - Test batch function (multiple items serial)
  - Buat `src/tests/foodStationStatusCheck.test.ts`:
    - Mock POST response
    - Test sukses detection (body with "#capture-area")
    - Test gagal detection (body with "Data NIK tidak ditemukan")
    - Test error/timeout (3 retries)
    - Test batch function
  - Pakai pattern: `mock.module` + dynamic import + query suffix (lihat helpers.ts)

  **Must NOT do**:
  - Jangan hit real API endpoints
  - Jangan ubah source files

  **Recommended Agent Profile**:
  - **Category**: `implementation`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T9, T10)
  - **Blocks**: None
  - **Blocked By**: T3, T4

  **References**:
  - `src/tests/helpers.ts` — Mock factories
  - `src/tests/locationGate.test.ts` — Dynamic import + query suffix pattern
  - `src/tests/supabase-location.test.ts` — Mock chain pattern
  - `src/services/pasarjayaStatusCheck.ts` (T3)
  - `src/services/foodStationStatusCheck.ts` (T4)

  **Acceptance Criteria**:
  - [ ] `pasarjayaStatusCheck.test.ts` — min 6 tests, all pass
  - [ ] `foodStationStatusCheck.test.ts` — min 4 tests, all pass
  - [ ] `bun test --isolate` full suite pass

  **QA Scenarios**:
  ```
  Scenario: All new tests pass
    Tool: Bash
    Steps:
      1. bun test src/tests/pasarjayaStatusCheck.test.ts
      2. bun test src/tests/foodStationStatusCheck.test.ts
      3. bun test (full suite)
    Expected Result: All pass, 0 fail
    Evidence: .sisyphus/evidence/task-8-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(status): unit tests cek status Pasarjaya + Food Station`
  - Files: `src/tests/pasarjayaStatusCheck.test.ts`, `src/tests/foodStationStatusCheck.test.ts`
  - Pre-commit: `bun test --isolate`

- [x] 9. Unit Tests: Format Functions

  **What to do**:
  - Buat `src/tests/statusCheckFormatter.test.ts`:
    - Test `buildPasarjayaStatusSummary` — sukses with detail, gagal, error, mixed
    - Test `buildPasarjayaFailedCopy` — tanggal_lahir DDMMYYYY conversion, null tanggal_lahir
    - Test `buildFoodStationStatusSummary` — sukses, gagal, error
    - Test `buildFoodStationFailedCopy` — format tanpa tgl lahir
    - Test edge cases: empty results, all sukses (no failed copy), all gagal

  **Must NOT do**:
  - Jangan ubah source files
  - Jangan test existing Dharmajaya formatters (sudah ada)

  **Recommended Agent Profile**:
  - **Category**: `implementation`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T8, T10)
  - **Blocks**: None
  - **Blocked By**: T7

  **References**:
  - `src/services/statusCheckService.ts` (or `statusCheckFormatter.ts`) — Format functions (T7)
  - `src/tests/helpers.ts` — Test patterns

  **Acceptance Criteria**:
  - [ ] `statusCheckFormatter.test.ts` — min 8 tests, all pass
  - [ ] `bun test --isolate` full suite pass

  **QA Scenarios**:
  ```
  Scenario: All format tests pass
    Tool: Bash
    Steps:
      1. bun test src/tests/statusCheckFormatter.test.ts
      2. bun test (full suite)
    Expected Result: All pass, 0 fail
    Evidence: .sisyphus/evidence/task-9-test-results.txt
  ```

  **Commit**: YES (grouped with T8)
  - Message: `test(status): unit + integration tests cek status multi-provider`
  - Files: `src/tests/statusCheckFormatter.test.ts`

- [x] 10. Integration Test: Multi-Provider Status Check Flow

  **What to do**:
  - Buat `src/tests/statusCheck-multiProvider.test.ts`:
    - Mock semua external calls (Dharmajaya API, Pasarjaya CSRF+POST, Food Station POST)
    - Mock `getTodayRecapForSender` untuk return mixed-provider data
    - Test scenarios:
      1. User pilih Dharmajaya → flow sama persis (checkRegistrationStatuses called)
      2. User pilih Pasarjaya → checkPasarjayaStatuses called, output format correct
      3. User pilih Food Station → checkFoodStationStatuses called, output format correct
      4. Provider filter — hanya data matching provider di-cek
      5. No data for selected provider → "tidak ada data" message
      6. Provider tutup → tidak muncul di sub-menu
  - Pakai dynamic import + query suffix pattern

  **Must NOT do**:
  - Jangan hit real APIs
  - Jangan ubah source files

  **Recommended Agent Profile**:
  - **Category**: `implementation`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T8, T9)
  - **Blocks**: None
  - **Blocked By**: T6

  **References**:
  - `src/tests/integration-location.test.ts` — Integration test pattern (mock stores + dynamic import)
  - `src/wa.ts` — Status check handler (T6)
  - All service files

  **Acceptance Criteria**:
  - [ ] `statusCheck-multiProvider.test.ts` — min 6 tests, all pass
  - [ ] `bun test --isolate` full suite pass

  **QA Scenarios**:
  ```
  Scenario: Full integration test suite passes
    Tool: Bash
    Steps:
      1. bun test src/tests/statusCheck-multiProvider.test.ts
      2. bun test (full suite)
    Expected Result: All pass, 0 fail
    Evidence: .sisyphus/evidence/task-10-test-results.txt
  ```

  **Commit**: YES (grouped with T8, T9)
  - Message: `test(status): unit + integration tests cek status multi-provider`
  - Files: `src/tests/statusCheck-multiProvider.test.ts`
  - Pre-commit: `bun test --isolate`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `review`
  Run `tsc --noEmit` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `testing`
  Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty data, API timeout, CSRF failure. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files | Pre-commit |
|------|---------------|-------|------------|
| 1 | `feat(status): extend StatusCheckItem + resolveStatusSourceItems untuk multi-provider` | statusCheckService.ts, wa.ts, state.ts | tsc --noEmit |
| 1 | `feat(status): service cek status Pasarjaya (CSRF+cookie+HTML parse)` | pasarjayaStatusCheck.ts | tsc --noEmit |
| 1 | `feat(status): service cek status Food Station (POST+parse)` | foodStationStatusCheck.ts | tsc --noEmit |
| 2 | `feat(status): sub-menu provider + routing + format output multi-provider` | wa.ts, messages.ts | tsc --noEmit |
| 3 | `test(status): unit + integration tests cek status multi-provider` | tests/*.test.ts | bun test |

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit          # Expected: 0 errors
bun test --isolate         # Expected: all pass
```

### Final Checklist
- [ ] Sub-menu provider dinamis (hide tutup)
- [ ] Dharmajaya flow TIDAK BERUBAH
- [ ] Pasarjaya cek status via CSRF+cookie
- [ ] Food Station cek status via POST
- [ ] Data gagal Pasarjaya include tgl lahir DDMMYYYY
- [ ] Text-only output (no foto)
- [ ] All tests pass
- [ ] tsc clean
