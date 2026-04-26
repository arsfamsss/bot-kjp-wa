# Jam Operasional Per-Provider

## TL;DR

> **Ringkasan**: Tambah jam operasional per-provider (Dharmajaya 06:05-23:59, Pasarjaya 07:10-23:59, Foodstation 06:30-15:00) dengan admin override (Buka/Tutup Sekarang per-provider). Global gate tetap sebagai master switch.
> 
> **Deliverables**:
> - Config `REGISTRATION_HOURS` di messages.ts (jam default per-provider)
> - Fungsi `isProviderOpen()` yang cek jam + override + admin-block
> - Menu user dinamis: provider di luar jam tampil dengan label "(buka jam X)"
> - Tabel `provider_operation_overrides` untuk admin override
> - Admin menu opsi 4 "Atur Jam Per-Provider" di SETTING_OPERATION_MENU
> - Phase 0 di `isSpecificLocationClosed()` untuk reject saat submit
> - Unit + integration tests
> 
> **Estimasi Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (config) → T4 (gate) → T6 (wa.ts wiring) → T8 (tests)

---

## Context

### Permintaan Awal
User mau tambah jam operasional per-provider. Saat ini hanya ada global open/close (00:00-06:05 tutup). Masing-masing provider punya jam berbeda:
- Dharmajaya: 06:05-23:59 (sama dengan global default)
- Pasarjaya: 07:10-23:59
- Foodstation: 06:30-15:00

### Ringkasan Interview
**Keputusan Utama**:
- Jam default: hardcode di config (messages.ts), bukan DB
- Override: tabel baru `provider_operation_overrides` (upsert 1 row per provider)
- "Buka Sekarang": buka sampai 23:59 WIB hari itu, besok kembali ke default otomatis
- "Tutup Sekarang": periode manual (start-end datetime), sama pattern existing
- "Kembali ke Default": HANYA reset override per-provider, global bot_settings TIDAK berubah
- Menu user: provider di luar jam TAMPIL dengan label "(buka jam 07:10)" — BUKAN hidden
- Global `isSystemClosed()` tetap sebagai master switch (layer 1), per-provider = layer 2
- Jam registrasi Pasarjaya = 07:10 (disamakan dengan cek status)
- Jam registrasi Foodstation = 06:30-15:00 (BEDA dari cek status 16:10-23:59 — sengaja)
- Menu admin: tambah opsi 4 "Atur Jam Per-Provider" di SETTING_OPERATION_MENU existing
- Test strategy: tests-after

### Temuan Riset
- `STATUS_CHECK_HOURS` (messages.ts:8-12): pattern yang bisa di-copy untuk `REGISTRATION_HOURS`
- `isStatusCheckOpen()` (messages.ts:20-30): pattern minute-based WIB check
- `buildFormatDaftarMessage()` (messages.ts:58-87): sudah hide blocked providers, perlu extend untuk jam
- `getActiveProviderMapping()` (messages.ts:112-127): perlu extend untuk jam
- `isProviderBlocked()` (supabase.ts:1745): JANGAN diubah — fungsi baru panggil ini internally
- `isSpecificLocationClosed()` (locationGate.ts:28-56): perlu Phase 0 untuk jam
- `SETTING_OPERATION_MENU` (wa.ts:4654-4723): perlu opsi 4 baru
- `formatOperationStatus()` (wa.ts:408-420): pattern format jam
- `parseAdminWibDateTimeToIso()` (wa.ts:422): reuse untuk input datetime manual close

### Metis Review
**Gap yang diatasi**:
- Registrasi vs cek status hours: BEDA untuk Foodstation (sengaja), SAMA untuk Pasarjaya (07:10)
- Provider di luar jam: TAMPIL + label jam (bukan hidden)
- "Kembali ke Default": hanya override, bukan global
- Menu admin: Opsi A (tambah opsi 4)
- In-progress registration: tolak saat submit (konsisten dengan mid-flow rejection existing)
- Global gate: per-provider TIDAK bisa bypass global closed
- Status check: TIDAK terpengaruh jam registrasi

---

## Work Objectives

### Core Objective
Tambah jam operasional per-provider untuk pendaftaran, dengan admin override per-provider, tanpa mengubah global gate atau fitur cek status.

### Concrete Deliverables
- `REGISTRATION_HOURS` config di messages.ts
- `isProviderOpen(provider)` fungsi di messages.ts
- `getProviderClosedLabel(provider)` fungsi di messages.ts
- `provider_operation_overrides` SQL schema
- CRUD override di supabase.ts
- Phase 0 di `isSpecificLocationClosed()` di locationGate.ts
- `buildFormatDaftarMessage()` + `getActiveProviderMapping()` extended
- Admin states + handler untuk per-provider Buka/Tutup/Default
- Opsi 4 di SETTING_OPERATION_MENU
- Unit + integration tests

### Definition of Done
- [ ] Semua provider punya jam operasional yang di-enforce
- [ ] Provider di luar jam tampil di menu dengan label "(buka jam X)"
- [ ] Admin bisa Buka/Tutup/Default per-provider
- [ ] "Buka Sekarang" auto-expire di 23:59 WIB
- [ ] Global gate tetap berfungsi sebagai master switch
- [ ] Cek status TIDAK terpengaruh
- [ ] 0 error tsc, semua test pass

### Must Have
- Jam default hardcoded: Dharmajaya 06:05-23:59, Pasarjaya 07:10-23:59, Foodstation 06:30-15:00
- Override per-provider via DB (Buka/Tutup Sekarang)
- "Buka Sekarang" auto-expire 23:59 WIB hari itu
- Provider di luar jam tampil + label jam di menu user
- Phase 0 reject di `isSpecificLocationClosed()` saat submit
- Admin menu opsi 4 per-provider
- "Kembali ke Default" hanya reset override, bukan global

### Must NOT Have (Guardrails)
- JANGAN ubah `isSystemClosed()`, `getBotSettings()`, `updateBotSettings()`, atau tabel `bot_settings`
- JANGAN ubah `STATUS_CHECK_PROVIDER_MENU()`, `getStatusCheckProviderMapping()`, `isStatusCheckOpen()`, atau `STATUS_CHECK_HOURS`
- JANGAN tambah parameter ke `buildFormatDaftarMessage()` atau `getActiveProviderMapping()`
- JANGAN ubah `isProviderBlocked()` di supabase.ts
- JANGAN sentuh legacy `SETTING_CLOSE_TIME_*` states
- JANGAN tambah notifikasi, audit log, bulk command, atau recurring schedule
- JANGAN ubah urutan provider di menu manapun
- JANGAN refactor wa.ts di luar scope

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — Semua verifikasi agent-executed.

### Test Decision
- **Infrastructure exists**: YES (bun test sudah setup)
- **Automated tests**: Tests-after
- **Framework**: bun test --isolate

### QA Policy
Setiap task HARUS punya QA scenarios. Evidence di `.sisyphus/evidence/task-{N}-*.{ext}`.

- **Service/Logic**: Bash (bun test) — import, call, assert
- **Admin Flow**: Bash (bun test) — mock state transitions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 4 tasks parallel):
├── T1: REGISTRATION_HOURS config + isProviderOpen + getProviderClosedLabel [quick]
├── T2: SQL schema provider_operation_overrides [quick]
├── T3: CRUD override di supabase.ts [unspecified-high]
└── T4: Phase 0 di isSpecificLocationClosed + extend buildFormatDaftarMessage [deep]

Wave 2 (Admin Menu — 3 tasks parallel):
├── T5: Admin states di state.ts [quick]
├── T6: Admin handler per-provider + opsi 4 wiring di wa.ts [deep]
└── T7: "Kembali ke Default" reset override [quick]

Wave 3 (Tests — 2 tasks parallel):
├── T8: Unit tests (providerHours + supabase override) [implementation]
└── T9: Integration test (admin flow + menu + gate) [implementation]

Wave FINAL (4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (review)
├── F3: Real manual QA (testing)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | - | T4, T6, T8 | 1 |
| T2 | - | T3 | 1 |
| T3 | T2 | T4, T6, T7, T8 | 1 |
| T4 | T1, T3 | T6, T8 | 1 |
| T5 | - | T6 | 2 |
| T6 | T1, T3, T4, T5 | T9 | 2 |
| T7 | T3 | T9 | 2 |
| T8 | T1, T3, T4 | F1-F4 | 3 |
| T9 | T6, T7 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `quick`, T2 `quick`, T3 `unspecified-high`, T4 `deep`
- **Wave 2**: 3 tasks — T5 `quick`, T6 `deep`, T7 `quick`
- **Wave 3**: 2 tasks — T8 `implementation`, T9 `implementation`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `review`, F3 `testing`, F4 `deep`

---

## TODOs

- [x] 1. Config REGISTRATION_HOURS + isProviderOpen + getProviderClosedLabel

  **What to do**:
  - Tambah `REGISTRATION_HOURS` config di `src/config/messages.ts` mengikuti pattern `STATUS_CHECK_HOURS` (line 8-12)
  - Format: `Record<string, { startHour: number, startMinute: number, endHour: number, endMinute: number, label: string }>`
  - Values: `DHARMAJAYA: { 6, 5, 23, 59, '06.05 - 23.59' }`, `PASARJAYA: { 7, 10, 23, 59, '07.10 - 23.59' }`, `FOOD_STATION: { 6, 30, 15, 0, '06.30 - 15.00' }`
  - Tambah `isProviderOpen(provider: string): boolean` — copy pattern `isStatusCheckOpen()` (line 20-30): ambil WIB parts, hitung minute-of-day, compare dengan REGISTRATION_HOURS. Return true jika dalam jam operasional.
  - Tambah `getProviderClosedLabel(provider: string): string` — return `(buka jam ${REGISTRATION_HOURS[provider].label.split(' - ')[0]})` untuk label di menu user
  - JANGAN ubah `STATUS_CHECK_HOURS`, `isStatusCheckOpen()`, atau fungsi status check lainnya

  **Must NOT do**:
  - Ubah STATUS_CHECK_HOURS atau isStatusCheckOpen
  - Tambah parameter ke buildFormatDaftarMessage atau getActiveProviderMapping

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T4, T6, T8
  - **Blocked By**: None

  **References**:
  - `src/config/messages.ts:8-12` — `STATUS_CHECK_HOURS` pattern to copy
  - `src/config/messages.ts:20-30` — `isStatusCheckOpen()` pattern to copy
  - `src/config/messages.ts:14-18` — `STATUS_CHECK_PROVIDER_DISPLAY` for display names

  **Acceptance Criteria**:
  - [ ] `REGISTRATION_HOURS` exported dengan 3 provider entries
  - [ ] `isProviderOpen('PASARJAYA')` return false saat 06:00 WIB, true saat 08:00 WIB
  - [ ] `isProviderOpen('FOOD_STATION')` return true saat 07:00 WIB, false saat 16:00 WIB
  - [ ] `getProviderClosedLabel('PASARJAYA')` return string berisi "07.10"
  - [ ] 0 error LSP diagnostics

  **QA Scenarios**:
  ```
  Scenario: isProviderOpen returns correct values
    Tool: Bash (bun test)
    Steps:
      1. Import isProviderOpen dari messages.ts
      2. Mock getWibParts untuk return { hour: 6, minute: 0 }
      3. Assert isProviderOpen('PASARJAYA') === false
      4. Mock getWibParts untuk return { hour: 8, minute: 0 }
      5. Assert isProviderOpen('PASARJAYA') === true
    Expected Result: Semua assertion pass
    Evidence: .sisyphus/evidence/task-1-provider-open.txt

  Scenario: Foodstation jam berbeda dari cek status
    Tool: Bash (bun test)
    Steps:
      1. Mock getWibParts untuk return { hour: 14, minute: 0 }
      2. Assert isProviderOpen('FOOD_STATION') === true (registrasi buka 06:30-15:00)
      3. Assert isStatusCheckOpen('FOOD_STATION') === false (cek status buka 16:10-23:59)
    Expected Result: Registrasi buka, cek status tutup — memang beda
    Evidence: .sisyphus/evidence/task-1-foodstation-hours.txt
  ```

  **Commit**: YES
  - Message: `feat(config): tambah REGISTRATION_HOURS + isProviderOpen`
  - Files: `src/config/messages.ts`

- [x] 2. SQL Schema provider_operation_overrides

  **What to do**:
  - Buat file `src/sql/provider_operation_overrides.sql`
  - Schema: `provider TEXT PRIMARY KEY`, `override_type TEXT NOT NULL` ('open' atau 'close'), `expires_at TIMESTAMPTZ` (untuk auto-expire "Buka Sekarang"), `manual_close_start TIMESTAMPTZ` (untuk "Tutup Sekarang"), `manual_close_end TIMESTAMPTZ`, `created_at TIMESTAMPTZ DEFAULT now()`
  - Upsert pattern: 1 row per provider max (PRIMARY KEY on provider)
  - Index: `idx_provider_overrides_type` on `(override_type)`

  **Must NOT do**:
  - Ubah tabel bot_settings
  - Tambah kolom yang tidak diminta

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T3
  - **Blocked By**: None

  **References**:
  - `src/sql/blocked_locations.sql` — pattern SQL DDL existing
  - `src/sql/location_schedules.sql` — pattern tabel baru

  **Acceptance Criteria**:
  - [ ] File `src/sql/provider_operation_overrides.sql` ada
  - [ ] Schema punya 6 kolom: provider, override_type, expires_at, manual_close_start, manual_close_end, created_at
  - [ ] PRIMARY KEY on provider (upsert pattern)

  **QA Scenarios**:
  ```
  Scenario: SQL file valid
    Tool: Bash
    Steps:
      1. Read file src/sql/provider_operation_overrides.sql
      2. Verify CREATE TABLE statement
      3. Verify PRIMARY KEY on provider
      4. Verify 6 columns present
    Expected Result: Valid SQL DDL
    Evidence: .sisyphus/evidence/task-2-sql-schema.txt
  ```

  **Commit**: YES
  - Message: `feat(db): schema provider_operation_overrides`
  - Files: `src/sql/provider_operation_overrides.sql`

- [x] 3. CRUD Override di supabase.ts

  **What to do**:
  - Tambah interface `ProviderOverride` di supabase.ts: `{ provider: string, override_type: 'open' | 'close', expires_at?: string | null, manual_close_start?: string | null, manual_close_end?: string | null, created_at?: string }`
  - Tambah `getProviderOverride(provider: string): Promise<ProviderOverride | null>` — SELECT dari `provider_operation_overrides` WHERE provider eq. Return null jika tidak ada row.
  - Tambah `upsertProviderOverride(data: { provider: string, override_type: 'open' | 'close', expires_at?: string, manual_close_start?: string, manual_close_end?: string }): Promise<boolean>` — UPSERT dengan onConflict: 'provider'. Return true jika sukses.
  - Tambah `deleteProviderOverride(provider: string): Promise<boolean>` — DELETE WHERE provider eq. Return true jika sukses.
  - Tambah `deleteAllProviderOverrides(): Promise<boolean>` — DELETE semua rows (untuk "Kembali ke Default"). Return true jika sukses.
  - Semua fungsi ikuti pattern `isMissingTableError()` error handling existing

  **Must NOT do**:
  - Ubah `isProviderBlocked()` atau fungsi existing lainnya
  - Ubah `getBotSettings()` atau `updateBotSettings()`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (tapi T2 harus selesai dulu untuk referensi schema)
  - **Parallel Group**: Wave 1 (with T1, T2, T4)
  - **Blocks**: T4, T6, T7, T8
  - **Blocked By**: T2 (schema reference)

  **References**:
  - `src/supabase.ts:1591-1640` — `closeLocation()` upsert pattern
  - `src/supabase.ts:1622-1645` — `openLocation()` soft-toggle pattern
  - `src/supabase.ts:1745-1765` — `isProviderBlocked()` query pattern
  - `src/supabase.ts:1800-1899` — schedule CRUD pattern (createSchedule, deleteSchedule)
  - `src/sql/provider_operation_overrides.sql` — schema reference (dari T2)

  **Acceptance Criteria**:
  - [ ] `getProviderOverride('PASARJAYA')` return null saat tidak ada override
  - [ ] `upsertProviderOverride({provider:'PASARJAYA', override_type:'open', expires_at:'...'})` return true
  - [ ] `getProviderOverride('PASARJAYA')` return override setelah upsert
  - [ ] `deleteProviderOverride('PASARJAYA')` return true
  - [ ] `deleteAllProviderOverrides()` hapus semua rows
  - [ ] 0 error LSP diagnostics

  **QA Scenarios**:
  ```
  Scenario: CRUD override lifecycle
    Tool: Bash (bun test)
    Steps:
      1. Mock supabase client
      2. Call upsertProviderOverride with open override
      3. Assert upsert called with correct payload
      4. Call getProviderOverride
      5. Assert returns override object
      6. Call deleteProviderOverride
      7. Assert delete called
    Expected Result: Full CRUD lifecycle works
    Evidence: .sisyphus/evidence/task-3-crud-override.txt
  ```

  **Commit**: YES
  - Message: `feat(supabase): CRUD override jam provider`
  - Files: `src/supabase.ts`

- [x] 4. Phase 0 di isSpecificLocationClosed + Extend Menu Dinamis

  **What to do**:
  **Part A — Phase 0 di locationGate.ts**:
  - Import `isProviderOpen` dari messages.ts dan `getProviderOverride` dari supabase.ts
  - Di `isSpecificLocationClosed()`, SEBELUM Phase 1 (sub-location check), tambah Phase 0:
    1. Ambil override via `getProviderOverride(provider)`
    2. Jika override ada DAN override_type === 'open':
       - Cek `expires_at`: jika sudah lewat → abaikan override (expired)
       - Jika belum expired → return `{ closed: false }` (override buka, skip semua phase)
    3. Jika override ada DAN override_type === 'close':
       - Cek `manual_close_start` dan `manual_close_end`: jika sekarang dalam range → return `{ closed: true, reason: 'Ditutup sementara oleh admin' }`
       - Jika di luar range → abaikan override (expired)
    4. Jika tidak ada override aktif → cek `isProviderOpen(provider)`:
       - Jika false → return `{ closed: true, reason: 'Di luar jam operasional (${REGISTRATION_HOURS[provider].label} WIB)' }`
       - Jika true → lanjut ke Phase 1-3 existing
  - Priority: open-override > close-override > default-hours > existing phases

  **Part B — Extend buildFormatDaftarMessage**:
  - Di `buildFormatDaftarMessage()` (messages.ts:58-87), SETELAH cek `isProviderBlocked()`, tambah cek `isProviderOpen()`:
    - Jika provider blocked → skip (existing behavior)
    - Jika provider TIDAK open (di luar jam) → tampilkan dengan label: `${emoji} ${name} ${getProviderClosedLabel(provider)}`
    - Jika provider open → tampilkan normal (existing)
  - Juga cek override: jika ada open override aktif → tampilkan normal meskipun di luar jam default
  - Import `getProviderOverride` dari supabase

  **Part C — Extend getActiveProviderMapping**:
  - Di `getActiveProviderMapping()` (messages.ts:112-127), JANGAN exclude provider yang di luar jam
  - Provider di luar jam tetap masuk mapping (karena tampil di menu dengan label)
  - TAPI provider yang admin-blocked tetap di-exclude (existing behavior)
  - Tambah export `isProviderAvailable(provider): Promise<boolean>` yang cek: not blocked AND (open OR has active open-override). Ini untuk SELECT_LOCATION handler reject.

  **Must NOT do**:
  - Ubah signature buildFormatDaftarMessage (tetap zero-arg async)
  - Ubah signature getActiveProviderMapping (tetap zero-arg async)
  - Ubah isProviderBlocked
  - Ubah STATUS_CHECK_PROVIDER_MENU atau getStatusCheckProviderMapping

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (setelah T1 dan T3 selesai)
  - **Parallel Group**: Wave 1 (starts after T1+T3)
  - **Blocks**: T6, T8
  - **Blocked By**: T1 (config), T3 (CRUD override)

  **References**:
  - `src/services/locationGate.ts:28-56` — `isSpecificLocationClosed()` current 3-phase logic
  - `src/config/messages.ts:58-87` — `buildFormatDaftarMessage()` current implementation
  - `src/config/messages.ts:112-127` — `getActiveProviderMapping()` current implementation
  - `src/config/messages.ts:131-175` — `STATUS_CHECK_PROVIDER_MENU()` pattern for "(buka jam X)" label (line 165)
  - `src/supabase.ts:1745-1765` — `isProviderBlocked()` — DO NOT MODIFY
  - `src/time.ts:60-111` — `isSystemClosed()` — DO NOT MODIFY, reference only

  **Acceptance Criteria**:
  - [ ] `isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya')` return `{ closed: true, reason: 'Di luar jam...' }` saat 06:00 WIB
  - [ ] `isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya')` return `{ closed: false }` saat 08:00 WIB
  - [ ] Dengan open override aktif, `isSpecificLocationClosed` return `{ closed: false }` meskipun di luar jam
  - [ ] Dengan close override aktif, `isSpecificLocationClosed` return `{ closed: true }` meskipun dalam jam
  - [ ] `buildFormatDaftarMessage()` tampilkan Pasarjaya dengan "(buka jam 07.10)" saat 06:00 WIB
  - [ ] `buildFormatDaftarMessage()` tampilkan Pasarjaya normal saat 08:00 WIB
  - [ ] `getActiveProviderMapping()` tetap include provider di luar jam (untuk menu label)
  - [ ] `isProviderAvailable('PASARJAYA')` return false saat di luar jam tanpa override
  - [ ] STATUS_CHECK_PROVIDER_MENU TIDAK berubah
  - [ ] 0 error LSP diagnostics

  **QA Scenarios**:
  ```
  Scenario: Phase 0 reject di luar jam
    Tool: Bash (bun test)
    Steps:
      1. Mock getWibParts return { hour: 6, minute: 0 }
      2. Mock getProviderOverride return null
      3. Call isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya')
      4. Assert result.closed === true
      5. Assert result.reason contains '07.10'
    Expected Result: Rejected with operating hours message
    Evidence: .sisyphus/evidence/task-4-phase0-reject.txt

  Scenario: Open override bypasses hours
    Tool: Bash (bun test)
    Steps:
      1. Mock getWibParts return { hour: 6, minute: 0 }
      2. Mock getProviderOverride return { override_type: 'open', expires_at: future }
      3. Call isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya')
      4. Assert result.closed === false
    Expected Result: Override allows access outside hours
    Evidence: .sisyphus/evidence/task-4-open-override.txt

  Scenario: Menu shows label for closed provider
    Tool: Bash (bun test)
    Steps:
      1. Mock time to 06:00 WIB
      2. Mock isProviderBlocked return false for all
      3. Call buildFormatDaftarMessage()
      4. Assert result contains 'PASARJAYA' AND contains 'buka jam 07.10'
      5. Assert result contains 'DHARMAJAYA' without closed label
    Expected Result: Closed provider shown with hours label
    Evidence: .sisyphus/evidence/task-4-menu-label.txt
  ```

  **Commit**: YES
  - Message: `feat(lokasi): Phase 0 jam operasional + menu dinamis`
  - Files: `src/services/locationGate.ts`, `src/config/messages.ts`

- [x] 5. Admin States di state.ts

  **What to do**:
  - Tambah 4 string literal ke `AdminFlowState` type union di `src/state.ts`:
    - `'SETTING_PROVIDER_SELECT'` — pilih provider
    - `'SETTING_PROVIDER_ACTION'` — pilih aksi (Buka/Tutup/Default/Back)
    - `'SETTING_PROVIDER_MANUAL_CLOSE_START'` — input datetime mulai tutup
    - `'SETTING_PROVIDER_MANUAL_CLOSE_END'` — input datetime akhir tutup
  - Tambah `providerOverrideDraftByPhone` Map di state.ts: `Map<string, { provider: string, closeStart?: string }>` — untuk simpan draft saat admin input manual close datetime (2-step flow)
  - Export Map dan tambah cleanup di `clearTransientSessionContext` (jika ada di state.ts, atau note untuk wa.ts)

  **Must NOT do**:
  - Ubah state existing
  - Hapus state lama

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T7)
  - **Blocks**: T6
  - **Blocked By**: None

  **References**:
  - `src/state.ts:67-136` — `AdminFlowState` type union
  - `src/state.ts:233-238` — `CloseWindowDraft` + `closeWindowDraftByPhone` pattern
  - `src/state.ts:200-203` — `pendingLocationCandidates` Map pattern

  **Acceptance Criteria**:
  - [ ] 4 state baru ada di `AdminFlowState`
  - [ ] `providerOverrideDraftByPhone` Map exported
  - [ ] 0 error LSP diagnostics

  **QA Scenarios**:
  ```
  Scenario: States compile correctly
    Tool: Bash
    Steps:
      1. bunx tsc --noEmit
      2. Assert exit code 0
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-5-compile.txt
  ```

  **Commit**: YES (group with T6)

- [x] 6. Admin Handler Per-Provider + Opsi 4 Wiring di wa.ts

  **What to do**:
  **Part A — Opsi 4 di SETTING_OPERATION_MENU**:
  - Di handler `SETTING_OPERATION_MENU` (wa.ts:4654-4723), tambah case `'4'`:
    - Tampilkan daftar 3 provider dengan status jam saat ini (buka/tutup + override info)
    - Set state ke `SETTING_PROVIDER_SELECT`
  - Update teks menu SETTING_OPERATION_MENU untuk include opsi 4: "4️⃣ Atur Jam Per-Provider"

  **Part B — SETTING_PROVIDER_SELECT handler**:
  - `'0'` → kembali ke SETTING_OPERATION_MENU (re-render menu)
  - `'1'`/`'2'`/`'3'` → pilih provider (DHARMAJAYA/PASARJAYA/FOOD_STATION)
  - Tampilkan status provider: jam default, override aktif (jika ada), status saat ini (buka/tutup)
  - Set state ke `SETTING_PROVIDER_ACTION`
  - Simpan provider terpilih di session (bisa pakai `providerOverrideDraftByPhone`)

  **Part C — SETTING_PROVIDER_ACTION handler**:
  - `'0'` → kembali ke SETTING_PROVIDER_SELECT
  - `'1'` "Buka Sekarang" → upsert override `{ provider, override_type: 'open', expires_at: end-of-WIB-day }`. Hitung expires_at = hari ini 23:59:59 WIB → convert ke ISO. Pesan sukses: "✅ {Provider} dibuka sampai 23:59 WIB hari ini. Besok kembali ke jadwal default."
  - `'2'` "Tutup Sekarang" → set state ke `SETTING_PROVIDER_MANUAL_CLOSE_START`. Minta input datetime mulai.
  - `'3'` "Kembali ke Default" → delete override untuk provider ini. Pesan: "✅ {Provider} kembali ke jadwal default ({label})."
  - Tetap di `SETTING_PROVIDER_ACTION` setelah aksi (kecuali opsi 2)

  **Part D — SETTING_PROVIDER_MANUAL_CLOSE_START handler**:
  - `'0'` → kembali ke SETTING_PROVIDER_ACTION
  - Parse datetime input via `parseAdminWibDateTimeToIso()` (wa.ts:422)
  - Simpan di `providerOverrideDraftByPhone`
  - Set state ke `SETTING_PROVIDER_MANUAL_CLOSE_END`

  **Part E — SETTING_PROVIDER_MANUAL_CLOSE_END handler**:
  - `'0'` → kembali ke SETTING_PROVIDER_ACTION
  - Parse datetime, validate end > start
  - Upsert override `{ provider, override_type: 'close', manual_close_start, manual_close_end }`
  - Pesan sukses: "🔴 {Provider} ditutup dari {start} sampai {end}."
  - Clear draft, set state ke `SETTING_PROVIDER_ACTION`

  **Part F — 0-escape prevention**:
  - Tambah `!currentAdminFlow.startsWith('SETTING_PROVIDER_')` ke guard di wa.ts (sekitar line 3836/3026)

  **Must NOT do**:
  - Ubah handler SETTING_OPERATION_MENU opsi 1/2/3 (global Buka/Tutup/Default)
  - Ubah SETTING_MANUAL_CLOSE_START/END (global manual close)
  - Refactor wa.ts di luar scope

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1, T3, T4, T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9
  - **Blocked By**: T1, T3, T4, T5

  **References**:
  - `src/wa.ts:4654-4723` — `SETTING_OPERATION_MENU` handler (add opsi 4)
  - `src/wa.ts:4724-4761` — `SETTING_MANUAL_CLOSE_START` handler (pattern for datetime input)
  - `src/wa.ts:4762-4817` — `SETTING_MANUAL_CLOSE_END` handler (pattern for end datetime + validation)
  - `src/wa.ts:422` — `parseAdminWibDateTimeToIso()` function to reuse
  - `src/wa.ts:408-420` — `formatOperationStatus()` pattern for status display
  - `src/wa.ts:3836` — 0-escape prevention guard (add SETTING_PROVIDER_ prefix)
  - `src/wa.ts:338-341` — DEFAULT_CLOSE constants (reference only)
  - `src/state.ts` — `providerOverrideDraftByPhone` Map (dari T5)
  - `src/supabase.ts` — `upsertProviderOverride`, `deleteProviderOverride`, `getProviderOverride` (dari T3)
  - `src/config/messages.ts` — `REGISTRATION_HOURS`, `isProviderOpen` (dari T1)
  - `src/time.ts` — `getWibParts()` untuk hitung end-of-day WIB

  **Acceptance Criteria**:
  - [ ] Opsi 4 muncul di SETTING_OPERATION_MENU
  - [ ] Admin bisa pilih provider → lihat status → Buka/Tutup/Default
  - [ ] "Buka Sekarang" upsert override dengan expires_at hari ini 23:59 WIB
  - [ ] "Tutup Sekarang" 2-step flow (start → end datetime)
  - [ ] "Kembali ke Default" delete override provider
  - [ ] `0` di setiap level kembali ke level sebelumnya
  - [ ] 0-escape prevention include SETTING_PROVIDER_ prefix
  - [ ] 0 error LSP diagnostics

  **QA Scenarios**:
  ```
  Scenario: Admin Buka Sekarang per-provider
    Tool: Bash (bun test)
    Steps:
      1. Simulate admin flow: SETTING_OPERATION_MENU → '4' → SETTING_PROVIDER_SELECT
      2. Pick '2' (PASARJAYA) → SETTING_PROVIDER_ACTION
      3. Pick '1' (Buka Sekarang)
      4. Assert upsertProviderOverride called with { provider: 'PASARJAYA', override_type: 'open', expires_at: contains today's date }
      5. Assert reply contains 'dibuka sampai 23:59'
    Expected Result: Override created with correct expiry
    Evidence: .sisyphus/evidence/task-6-buka-sekarang.txt

  Scenario: Admin Tutup Sekarang per-provider (2-step)
    Tool: Bash (bun test)
    Steps:
      1. Navigate to SETTING_PROVIDER_ACTION for DHARMAJAYA
      2. Pick '2' (Tutup Sekarang) → SETTING_PROVIDER_MANUAL_CLOSE_START
      3. Input '26-04-2026 10:00' → SETTING_PROVIDER_MANUAL_CLOSE_END
      4. Input '26-04-2026 18:00'
      5. Assert upsertProviderOverride called with close override + start/end
      6. Assert reply contains 'ditutup dari'
    Expected Result: Manual close override created
    Evidence: .sisyphus/evidence/task-6-tutup-sekarang.txt

  Scenario: Back navigation at every level
    Tool: Bash (bun test)
    Steps:
      1. SETTING_PROVIDER_SELECT → '0' → back to SETTING_OPERATION_MENU
      2. SETTING_PROVIDER_ACTION → '0' → back to SETTING_PROVIDER_SELECT
      3. SETTING_PROVIDER_MANUAL_CLOSE_START → '0' → back to SETTING_PROVIDER_ACTION
    Expected Result: Each '0' goes back one level
    Evidence: .sisyphus/evidence/task-6-back-nav.txt
  ```

  **Commit**: YES
  - Message: `feat(admin): menu per-provider Buka/Tutup/Default jam operasional`
  - Files: `src/state.ts`, `src/wa.ts`

- [x] 7. "Kembali ke Default" Reset Override

  **What to do**:
  - Di handler `SETTING_OPERATION_MENU` opsi `'3'` (wa.ts:4697-4708), SETELAH reset global bot_settings ke default:
    - Tambah call `deleteAllProviderOverrides()` untuk hapus semua override per-provider
    - Pesan sukses: tambah info bahwa override per-provider juga di-reset
  - Import `deleteAllProviderOverrides` dari supabase.ts (dynamic import)

  **Must NOT do**:
  - Ubah logic reset global bot_settings (tetap set ke DEFAULT_CLOSE constants)
  - Ubah opsi 1 atau 2

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T5, T6)
  - **Blocks**: T9
  - **Blocked By**: T3 (CRUD override)

  **References**:
  - `src/wa.ts:4697-4708` — opsi 3 "Kembali ke Default" handler
  - `src/supabase.ts` — `deleteAllProviderOverrides()` (dari T3)

  **Acceptance Criteria**:
  - [ ] Opsi 3 "Kembali ke Default" juga call `deleteAllProviderOverrides()`
  - [ ] Pesan sukses mention bahwa override per-provider di-reset
  - [ ] Global bot_settings tetap di-reset ke DEFAULT_CLOSE (existing behavior preserved)
  - [ ] 0 error LSP diagnostics

  **QA Scenarios**:
  ```
  Scenario: Kembali ke Default resets overrides
    Tool: Bash (bun test)
    Steps:
      1. Mock deleteAllProviderOverrides
      2. Simulate admin picking opsi 3 di SETTING_OPERATION_MENU
      3. Assert updateBotSettings called with DEFAULT_CLOSE values
      4. Assert deleteAllProviderOverrides called
      5. Assert reply mentions override di-reset
    Expected Result: Both global and per-provider reset
    Evidence: .sisyphus/evidence/task-7-default-reset.txt
  ```

  **Commit**: YES (group with T6)
  - Message: `feat(admin): menu per-provider Buka/Tutup/Default jam operasional`
  - Files: `src/wa.ts`

- [x] 8. Unit Tests — providerHours + supabase override

  **What to do**:
  - Buat `src/tests/providerHours.test.ts`:
    - Test `isProviderOpen()`: 3 provider × (dalam jam, di luar jam) = 6 test
    - Test `getProviderClosedLabel()`: 3 provider = 3 test
    - Test `REGISTRATION_HOURS` config: 3 entries, correct values
    - Test Phase 0 di `isSpecificLocationClosed()`: open/closed/override-open/override-close/expired-override = 5 test
    - Test `isProviderAvailable()`: blocked/time-closed/open/override = 4 test
    - Test `buildFormatDaftarMessage()` dengan provider di luar jam: label muncul = 2 test
  - Buat `src/tests/supabase-override.test.ts`:
    - Test CRUD: upsert/get/delete/deleteAll = 4 test
  - Ikuti mock pattern existing: `mock.module` + dynamic import + query suffix + `--isolate`

  **Must NOT do**:
  - Ubah test files existing
  - Test fungsi status check (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `implementation`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T9)
  - **Blocks**: F1-F4
  - **Blocked By**: T1, T3, T4

  **References**:
  - `src/tests/locationGate.test.ts` — pattern test locationGate dengan mock supabase
  - `src/tests/supabase-location.test.ts` — pattern test supabase CRUD
  - `src/tests/helpers.ts` — mock factories
  - `src/tests/statusCheckFormatter.test.ts` — pattern test messages.ts functions

  **Acceptance Criteria**:
  - [ ] `providerHours.test.ts` minimal 20 tests
  - [ ] `supabase-override.test.ts` minimal 4 tests
  - [ ] `bun test --isolate` semua pass, 0 fail
  - [ ] Full suite tetap pass (no regression)

  **QA Scenarios**:
  ```
  Scenario: Full test suite pass
    Tool: Bash
    Steps:
      1. bun test --isolate
      2. Assert 0 failures
      3. Assert new test files included in output
    Expected Result: All tests pass including new ones
    Evidence: .sisyphus/evidence/task-8-test-results.txt
  ```

  **Commit**: YES
  - Message: `test: unit test jam operasional per-provider`
  - Files: `src/tests/providerHours.test.ts`, `src/tests/supabase-override.test.ts`

- [x] 9. Integration Test — Admin Flow + Menu + Gate

  **What to do**:
  - Buat `src/tests/providerHours-integration.test.ts`:
    - Scenario 1: Provider di luar jam → menu tampil dengan label → user pilih → reject di isSpecificLocationClosed
    - Scenario 2: Admin Buka Sekarang → provider buka meskipun di luar jam → user bisa daftar
    - Scenario 3: Admin Tutup Sekarang → provider tutup meskipun dalam jam → user ditolak
    - Scenario 4: "Kembali ke Default" → semua override dihapus → jam default berlaku
    - Scenario 5: Override expired → kembali ke jam default otomatis
    - Scenario 6: Global closed → per-provider override tidak bisa bypass
    - Scenario 7: Status check TIDAK terpengaruh oleh jam registrasi
  - Ikuti pattern `src/tests/integration-location.test.ts` untuk mock setup

  **Must NOT do**:
  - Ubah test files existing

  **Recommended Agent Profile**:
  - **Category**: `implementation`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T8)
  - **Blocks**: F1-F4
  - **Blocked By**: T6, T7

  **References**:
  - `src/tests/integration-location.test.ts` — pattern integration test
  - `src/tests/statusCheck-multiProvider.test.ts` — pattern multi-provider test

  **Acceptance Criteria**:
  - [ ] 7 integration test scenarios
  - [ ] `bun test --isolate` semua pass
  - [ ] Full suite tetap pass

  **QA Scenarios**:
  ```
  Scenario: Integration test suite pass
    Tool: Bash
    Steps:
      1. bun test src/tests/providerHours-integration.test.ts --isolate
      2. Assert 7 pass, 0 fail
    Expected Result: All integration scenarios pass
    Evidence: .sisyphus/evidence/task-9-integration.txt
  ```

  **Commit**: YES
  - Message: `test: integration test jam operasional per-provider`
  - Files: `src/tests/providerHours-integration.test.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Baca plan end-to-end. Untuk setiap "Must Have": verifikasi implementasi ada. Untuk setiap "Must NOT Have": cari pattern terlarang. Cek evidence files.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `review`
  Jalankan `tsc --noEmit` + `bun test`. Review semua file yang berubah: `as any`, empty catch, console.log, commented-out code, unused imports, AI slop.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `testing`
  Jalankan SEMUA QA scenario dari SEMUA task. Test cross-task integration. Test edge cases.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Untuk setiap task: baca "What to do", baca actual diff. Verifikasi 1:1. Cek "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files |
|------|---------------|-------|
| 1 | `feat(config): tambah REGISTRATION_HOURS + isProviderOpen` | messages.ts |
| 1 | `feat(db): schema provider_operation_overrides` | src/sql/provider_operation_overrides.sql |
| 1 | `feat(supabase): CRUD override jam provider` | supabase.ts |
| 1 | `feat(lokasi): Phase 0 jam operasional + menu dinamis` | locationGate.ts, messages.ts |
| 2 | `feat(admin): menu per-provider Buka/Tutup/Default` | state.ts, wa.ts |
| 3 | `test: unit + integration jam operasional per-provider` | src/tests/*.test.ts |

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit  # Expected: 0 errors
bun test --isolate  # Expected: all pass, 0 fail
```

### Final Checklist
- [ ] Semua "Must Have" present
- [ ] Semua "Must NOT Have" absent
- [ ] Semua test pass
- [ ] Global gate tidak terpengaruh
- [ ] Cek status tidak terpengaruh
