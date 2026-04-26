# Fix Data Nyatu: Nama+KJP & KJP+NIK Satu Baris

## TL;DR

> **Quick Summary**: Perbaiki parser agar bisa memecah baris yang berisi Nama+KJP atau KJP+NIK yang nyatu menjadi baris terpisah, sehingga data user tidak ditolak dengan "DATA TIDAK LENGKAP".
>
> **Deliverables**:
> - Enhanced `parseRawMessageToLines()` di parser.ts dengan 2 tahap split baru
> - Unit test untuk semua 6 sub-pola + regression
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: T1 → T2 → T3

---

## Context

### Original Request
User sering kirim data 4 baris di HP, tapi bot terima 3 baris karena field nyatu. Admin harus manual edit + kirim ulang — sangat merepotkan. Contoh kasus nyata:
- `Bu haji/suha 5049483502922396 lansia` (Nama + KJP + label kartu)
- `Boru Sinaga3 kjp:5049488508915633` (Nama + label:KJP)
- `Suwarti kjp504948853150149738` (Nama + labelKJP tanpa spasi)
- `Tante 2 Kjp 504948120004302883` (Nama dengan angka + label KJP)
- `Lea Irma 5049483501993026 lansia` (Nama + KJP + label tanpa colon)
- `kjp: 5049488507463288 nik:3175065310890022` (label:KJP + label:NIK)

### Interview Summary
**Key Discussions**:
- Scope: Fix KEDUA pola (Nama+KJP dan KJP+NIK), bukan hanya satu
- Label kartu setelah KJP (lansia, dasawisma, dll) SERING terjadi
- Label nempel angka tanpa spasi (kjp504948...) JARANG tapi harus di-handle
- Label NIK bervariasi: nik, ktp, no ktp, atau polos
- Fix hanya di parser.ts, JANGAN ubah wa.ts

**Research Findings**:
- `parseRawMessageToLines` (parser.ts:333-401): pipeline sanitize → split \n → merge label-only → auto-split nama+angka
- Auto-split regex `/^(.*?)[\s\t]+(\d{16,})$/` HANYA match angka di AKHIR baris — gagal untuk `Nama KJP lansia`
- isLabel guard (line 385) BLOCK split saat candidateName mengandung label keyword — gagal untuk `Boru Sinaga3 kjp:504948...`
- KJP prefix selalu `504948`, panjang 16-18 digit — reliable detection anchor
- `cardTypeRules.ts` punya 30+ alias (kjp, lansia, dasawisma, dawis, guru, honorer, pjlp, kaj, dll)
- `extractCardNumber` (parser.ts:33-56) sudah bisa extract 504948-prefix dari string apapun

### Metis Review
**Identified Gaps** (addressed):
- Bare NIK tanpa label (`kjp: 504948... 3175065310890022`) → handle via digit-boundary detection setelah KJP number
- Label setelah KJP number (`lansia` di akhir) → handle via enhanced split yang tidak require angka di akhir
- Digits glued together (`kjp:5049488507463288nik:317...`) → handle via label-keyword split anchor
- Existing auto-split dan label-merge TIDAK BOLEH regress
- Card type label harus tetap preserved setelah split (agar `resolveJenisKartu` masih bisa detect)

---

## Work Objectives

### Core Objective
Enhance `parseRawMessageToLines()` agar bisa memecah baris yang berisi 504948-prefix KJP number + field lain (nama atau NIK) menjadi baris terpisah.

### Concrete Deliverables
- Modified `src/parser.ts`: fungsi `parseRawMessageToLines()` dengan 2 tahap split baru
- New test cases di `src/tests/parser.test.ts`: 10+ test cases untuk semua pola

### Definition of Done
- [ ] Semua 6 contoh kasus nyata user menghasilkan 4 baris setelah parse
- [ ] `bun test --isolate` semua pass (termasuk existing tests)
- [ ] `bunx tsc --noEmit` 0 error

### Must Have
- Split baris Nama+KJP yang ada label kartu setelah angka (Pola A1, A5)
- Split baris Nama+label:KJP (Pola A2, A3, A4)
- Split baris label:KJP+label:NIK (Pola B1)
- Preserve label kartu (lansia, dasawisma, dll) agar tetap terdeteksi oleh `resolveJenisKartu`
- Case-insensitive matching untuk semua label
- Existing auto-split dan label-merge TIDAK regress
- **FORMAT YANG SUDAH BENAR TIDAK TERGANGGU** — baris KJP yang sudah benar (misal `KJP 504948... lansia`, `lansia 504948...`, `504948... lansia`) TIDAK BOLEH di-split. Data 4 baris yang sudah benar harus tetap 4 baris.

### Must NOT Have (Guardrails)
- JANGAN ubah `wa.ts`, `cardTypeRules.ts`, `textSanitizer.ts`, `state.ts`
- JANGAN ubah `extractCardNumber`, `extractCardText`, `extractDigits`, `groupLinesToBlocks`, `buildParsedFields`
- JANGAN handle kombinasi lain (NIK+KK, KK+TglLahir, dll) — hanya Nama+KJP dan KJP+NIK
- JANGAN tambah dependency baru ke parser.ts
- JANGAN refactor existing auto-split regex atau isLabel guard — TAMBAH step baru, jangan modifikasi yang ada
- JANGAN handle 3+ field di 1 baris (misal Nama+KJP+NIK semua di 1 baris)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (bun test --isolate, bunfig.toml, helpers.ts)
- **Automated tests**: Tests-after
- **Framework**: bun test

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — parser enhancement):
├── T1: Enhance parseRawMessageToLines dengan 2 tahap split baru [deep]

Wave 2 (After Wave 1 — tests):
├── T2: Unit test semua pola + regression [implementation]

Wave FINAL (After ALL tasks):
├── T3: Full regression + build verification [quick]
├── F1-F4: Final verification wave

Critical Path: T1 → T2 → T3 → F1-F4
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 | - | T2, T3 |
| T2 | T1 | T3 |
| T3 | T2 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `deep`
- **Wave 2**: 1 task — T2 → `implementation`
- **Wave 3**: 1 task — T3 → `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `review`, F3 `testing`, F4 `deep`

---

## TODOs

- [x] 1. Enhance parseRawMessageToLines — Tambah 2 Tahap Split Baru

  **What to do**:

  Tambah 2 tahap processing baru di `parseRawMessageToLines()` (parser.ts:333-401). Tahap baru ini dijalankan SETELAH merge-label step (line 360) dan SEBELUM existing auto-split step (line 362). Jangan modifikasi existing code — tambah step baru di antara keduanya.

  **Tahap Baru 1: Split baris yang mengandung KJP number + NIK/KTP label+number (Pola B)**

  Deteksi baris yang mengandung:
  - Sebuah 504948-prefix number (16-18 digit)
  - DIIKUTI oleh label NIK/KTP (`nik`, `ktp`, `no ktp`, `no nik`, `nomor ktp`, `nomor nik`) + number 16 digit
  - ATAU diikuti oleh bare 16-digit number (tanpa label) yang BUKAN bagian dari KJP number

  Contoh input → output:
  - `kjp: 5049488507463288 nik:3175065310890022` → `["kjp: 5049488507463288", "nik:3175065310890022"]`
  - `lansia: 5049488507463288 ktp:3175065310890022` → `["lansia: 5049488507463288", "ktp:3175065310890022"]`
  - `kjp:5049488507463288nik:3175065310890022` → `["kjp:5049488507463288", "nik:3175065310890022"]` (digits glued, label anchor)

  Strategi deteksi:
  1. Cari 504948-prefix number di baris menggunakan regex `/504948\d{10,12}/`
  2. Setelah KJP number ditemukan, cek apakah SISA baris mengandung label NIK/KTP + 16 digit number
  3. Jika ya, split: bagian sebelum label NIK/KTP = baris 1, sisanya = baris 2
  4. Jika tidak ada label tapi ada bare 16-digit number terpisah oleh whitespace → juga split

  **Tahap Baru 2: Enhanced auto-split untuk Nama+KJP dengan label kartu (Pola A)**

  Enhance existing auto-split agar bisa handle:
  - Angka KJP (504948-prefix) yang TIDAK di akhir baris (ada label kartu setelahnya)
  - Label kartu yang nempel sebelum angka KJP (kjp:, lansia, dasawisma, dll)

  Contoh input → output:
  - `Bu haji/suha 5049483502922396 lansia` → `["Bu haji/suha", "5049483502922396 lansia"]`
  - `Lea Irma 5049483501993026 lansia` → `["Lea Irma", "5049483501993026 lansia"]`
  - `Boru Sinaga3 kjp:5049488508915633` → `["Boru Sinaga3", "kjp:5049488508915633"]`
  - `Suwarti kjp504948853150149738` → `["Suwarti", "kjp504948853150149738"]`
  - `Tante 2 Kjp 504948120004302883` → `["Tante 2", "Kjp 504948120004302883"]`

  Strategi deteksi:
  1. Cari 504948-prefix number di baris
  2. Tentukan "split point" = posisi dimana KJP-related content dimulai:
     - Jika ada label kartu keyword (dari isLabel regex) sebelum 504948 number → split sebelum label
     - Jika 504948 number langsung (tanpa label) → split sebelum angka 504948
  3. Bagian sebelum split point = Nama (harus mengandung huruf minimal 2)
  4. Bagian setelah split point = KJP line (preserve label + angka + trailing text)
  5. GUARD: Jangan split jika bagian "Nama" kosong atau hanya whitespace
  6. GUARD: Jangan split jika seluruh baris adalah label+angka saja (misal `KJP 504948...` tanpa nama) — cek apakah bagian "Nama" HANYA berisi label keyword (dari isLabel regex). Jika ya, JANGAN split.
  7. GUARD (KRITIS): Jangan split baris yang sudah benar formatnya! Contoh baris yang TIDAK BOLEH di-split:
     - `KJP 5049488500001234 lansia` → ini baris KJP yang benar, label+angka+jenis kartu. JANGAN pecah.
     - `5049488500001234 lansia` → ini baris KJP tanpa label. JANGAN pecah.
     - `lansia 5049488500001234` → ini baris KJP dengan label kartu di depan. JANGAN pecah.
     - `NIK 3175065310890022` → ini baris NIK yang benar. JANGAN pecah.
     - `KK 3175061208160078` → ini baris KK yang benar. JANGAN pecah.
     Cara membedakan "baris benar" vs "Nama+KJP nyatu":
     - Baris benar: bagian sebelum 504948 number HANYA berisi label keyword (KJP/lansia/dasawisma/dll) atau kosong
     - Nama+KJP nyatu: bagian sebelum 504948 number berisi NAMA ORANG (huruf non-label, minimal 2 karakter)

  **Urutan eksekusi dalam pipeline**:
  ```
  sanitize → split \n → merge label-only → [BARU: split KJP+NIK] → [BARU: split Nama+KJP] → existing auto-split
  ```

  Catatan penting:
  - Tahap KJP+NIK split HARUS dijalankan SEBELUM Nama+KJP split, karena jika baris berisi `Nama kjp:504948... nik:317...`, KJP+NIK split dulu memecah jadi `Nama kjp:504948...` dan `nik:317...`, lalu Nama+KJP split memecah `Nama kjp:504948...` jadi `Nama` dan `kjp:504948...`. Hasilnya 3 baris dari 1 baris.
  - Existing auto-split (line 362-398) tetap jalan setelah tahap baru — sebagai fallback untuk kasus yang tidak ter-handle oleh tahap baru.

  **Must NOT do**:
  - Jangan modifikasi existing merge-label loop (line 344-360)
  - Jangan modifikasi existing auto-split loop (line 362-398)
  - Jangan ubah signature fungsi `parseRawMessageToLines`
  - Jangan import module baru

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Logic parsing kompleks dengan banyak edge case, perlu careful regex design
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: T2, T3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/parser.ts:333-401` — Fungsi `parseRawMessageToLines` yang akan di-enhance. Baca SELURUH fungsi untuk pahami pipeline.
  - `src/parser.ts:344-360` — Merge-label loop. JANGAN UBAH. Tahap baru ditambah SETELAH ini.
  - `src/parser.ts:362-398` — Existing auto-split loop. JANGAN UBAH. Tahap baru ditambah SEBELUM ini.
  - `src/parser.ts:385` — isLabel regex. Referensi untuk keyword label yang sudah dikenali.
  - `src/parser.ts:369` — mergedRegex `/^(.*?)[\s\t]+(\d{16,})$/`. Referensi pattern existing.
  - `src/parser.ts:33-56` — `extractCardNumber()`. Bisa dipakai untuk detect 504948-prefix number.

  **API/Type References**:
  - `src/utils/cardTypeRules.ts:1-31` — `CARD_TYPE_ALIASES` object. Semua alias label kartu yang valid.
  - `src/parser.ts:26-31` — `extractDigits()`. Utility untuk extract semua digit dari string.

  **Test References**:
  - `src/tests/parser.test.ts` — Existing test file. Lihat `describe('parseRawMessageToLines')` untuk pattern test yang sudah ada.

  **WHY Each Reference Matters**:
  - parser.ts:333-401: Ini fungsi yang akan dimodifikasi — pahami seluruh pipeline sebelum tambah step
  - parser.ts:385 isLabel regex: Daftar keyword yang sudah dikenali — gunakan sebagai referensi untuk detect label kartu
  - cardTypeRules.ts: Daftar lengkap alias kartu — untuk memastikan split Nama+KJP mengenali semua jenis label
  - extractCardNumber: Sudah bisa detect 504948-prefix — bisa dipakai di tahap baru

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pola B1 — KJP+NIK dengan label
    Tool: Bash (bun test)
    Preconditions: parser.ts sudah di-enhance
    Steps:
      1. Import parseRawMessageToLines
      2. Call dengan input "Rakha adiansyah\nkjp: 5049488507463288 nik:3175065310890022\nKK :3175061208160078"
      3. Assert hasil = ["Rakha adiansyah", "kjp: 5049488507463288", "nik:3175065310890022", "KK :3175061208160078"]
    Expected Result: Array 4 elemen, KJP dan NIK terpisah
    Evidence: .sisyphus/evidence/task-1-pola-b1.txt

  Scenario: Pola A1 — Nama+KJP+label kartu
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "Bu haji/suha 5049483502922396 lansia\nKtp  3175020206800014\nKk 3175020801090397"
      2. Assert hasil = ["Bu haji/suha", "5049483502922396 lansia", "Ktp  3175020206800014", "Kk 3175020801090397"]
    Expected Result: Array 4 elemen, Nama dan KJP+label terpisah
    Evidence: .sisyphus/evidence/task-1-pola-a1.txt

  Scenario: Pola A2 — Nama+label:KJP
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "Boru Sinaga3 kjp:5049488508915633\nktp:3172026502821003\nkk:3175061202151037"
      2. Assert hasil = ["Boru Sinaga3", "kjp:5049488508915633", "ktp:3172026502821003", "kk:3175061202151037"]
    Expected Result: Array 4 elemen
    Evidence: .sisyphus/evidence/task-1-pola-a2.txt

  Scenario: Pola A4 — Nama dengan angka + label KJP
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "Tante 2 Kjp 504948120004302883\nNIK 3175020103850005\nKk 3175023004151011"
      2. Assert hasil = ["Tante 2", "Kjp 504948120004302883", "NIK 3175020103850005", "Kk 3175023004151011"]
    Expected Result: Array 4 elemen, "Tante 2" sebagai nama
    Evidence: .sisyphus/evidence/task-1-pola-a4.txt

  Scenario: Regression — existing auto-split tetap jalan
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "Agus Dalimin 5049488500001111"
      2. Assert hasil = ["Agus Dalimin", "5049488500001111"]
    Expected Result: Existing behavior preserved
    Evidence: .sisyphus/evidence/task-1-regression-autosplit.txt

  Scenario: Regression — existing label-merge tetap jalan
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "KTP\n3175065310890022"
      2. Assert hasil = ["KTP : 3175065310890022"]
    Expected Result: Existing behavior preserved
    Evidence: .sisyphus/evidence/task-1-regression-merge.txt

  Scenario: Negative — single label+number TIDAK di-split
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "NIK 3175065310890022"
      2. Assert hasil = ["NIK 3175065310890022"] (1 elemen, tidak di-split)
    Expected Result: Single label+number tetap 1 baris
    Evidence: .sisyphus/evidence/task-1-negative-single.txt

  Scenario: KRITIS — format benar KJP+label kartu TIDAK di-split
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "KJP 5049488500001234 lansia" (baris KJP yang sudah benar)
      2. Assert hasil = ["KJP 5049488500001234 lansia"] (1 elemen, TIDAK di-split)
      3. Call dengan input "5049488500001234 lansia" (KJP tanpa label)
      4. Assert hasil = ["5049488500001234 lansia"] (1 elemen, TIDAK di-split)
      5. Call dengan input "lansia 5049488500001234" (label kartu di depan)
      6. Assert hasil = ["lansia 5049488500001234"] (1 elemen, TIDAK di-split)
    Expected Result: Baris yang sudah benar formatnya TIDAK terpecah
    Evidence: .sisyphus/evidence/task-1-negative-correct-format.txt

  Scenario: KRITIS — full message 4 baris benar TIDAK berubah
    Tool: Bash (bun test)
    Steps:
      1. Call dengan input "Budi\n5049488500001234 lansia\n3175065310890022\n3175061208160078"
      2. Assert hasil = ["Budi", "5049488500001234 lansia", "3175065310890022", "3175061208160078"] (4 elemen, tidak berubah)
      3. Call dengan input "Budi\nKJP 5049488500001234\nKTP 3175065310890022\nKK 3175061208160078"
      4. Assert hasil tetap 4 elemen, tidak ada yang terpecah
    Expected Result: Data yang sudah benar 4 baris TIDAK terganggu
    Evidence: .sisyphus/evidence/task-1-negative-correct-4lines.txt
  ```

  **Commit**: YES
  - Message: `fix(parser): pecah baris Nama+KJP dan KJP+NIK yang nyatu`
  - Files: `src/parser.ts`
  - Pre-commit: `bunx tsc --noEmit`

---

- [x] 2. Unit Test — Semua Pola + Regression

  **What to do**:

  Tambah test cases baru di `src/tests/parser.test.ts` dalam `describe('parseRawMessageToLines')` block (atau buat describe baru jika belum ada). Test semua 6 sub-pola dari contoh kasus nyata user + regression tests.

  **Test cases yang WAJIB ada:**

  ```typescript
  describe('split Nama+KJP nyatu (Pola A)', () => {
    test('A1: Nama + KJP + label kartu di akhir', () => {
      // "Bu haji/suha 5049483502922396 lansia" → ["Bu haji/suha", "5049483502922396 lansia"]
    });
    test('A2: Nama + label:KJP', () => {
      // "Boru Sinaga3 kjp:5049488508915633" → ["Boru Sinaga3", "kjp:5049488508915633"]
    });
    test('A3: Nama + labelKJP tanpa spasi (jarang)', () => {
      // "Suwarti kjp504948853150149738" → ["Suwarti", "kjp504948853150149738"]
    });
    test('A4: Nama dengan angka + label KJP', () => {
      // "Tante 2 Kjp 504948120004302883" → ["Tante 2", "Kjp 504948120004302883"]
    });
    test('A5: Nama + KJP + label tanpa colon', () => {
      // "Lea Irma 5049483501993026 lansia" → ["Lea Irma", "5049483501993026 lansia"]
    });
  });

  describe('split KJP+NIK nyatu (Pola B)', () => {
    test('B1: label:KJP + label:NIK', () => {
      // "kjp: 5049488507463288 nik:3175065310890022" → ["kjp: 5049488507463288", "nik:3175065310890022"]
    });
    test('B2: label:KJP + label:KTP (variasi)', () => {
      // "lansia: 5049488507463288 ktp:3175065310890022" → ["lansia: 5049488507463288", "ktp:3175065310890022"]
    });
    test('B3: KJP+NIK tanpa spasi (digits glued)', () => {
      // "kjp:5049488507463288nik:3175065310890022" → ["kjp:5049488507463288", "nik:3175065310890022"]
    });
  });

  describe('full message split — kasus nyata user', () => {
    test('3 baris dengan KJP+NIK nyatu → 4 baris', () => {
      const input = "Rakha adiansyah\nkjp: 5049488507463288 nik:3175065310890022\nKK :3175061208160078";
      const result = parseRawMessageToLines(input);
      expect(result).toHaveLength(4);
    });
    test('3 baris dengan Nama+KJP nyatu → 4 baris', () => {
      const input = "Bu haji/suha 5049483502922396 lansia\nKtp  3175020206800014\nKk 3175020801090397";
      const result = parseRawMessageToLines(input);
      expect(result).toHaveLength(4);
    });
  });

  describe('regression — existing behavior preserved', () => {
    test('auto-split Nama+angka di akhir tetap jalan', () => {
      // "Agus Dalimin 5049488500001111" → ["Agus Dalimin", "5049488500001111"]
    });
    test('label-merge tetap jalan', () => {
      // "KTP\n3175065310890022" → ["KTP : 3175065310890022"]
    });
    test('single label+number TIDAK di-split', () => {
      // "NIK 3175065310890022" → ["NIK 3175065310890022"]
    });
    test('already correct 4 lines tidak berubah', () => {
      // "Nama\n5049488507463288\n3175065310890022\n3175061208160078" → 4 lines unchanged
    });
  });

  describe('KRITIS — format benar TIDAK terganggu', () => {
    test('KJP+label kartu di baris sendiri TIDAK di-split', () => {
      // "KJP 5049488500001234 lansia" → ["KJP 5049488500001234 lansia"] (1 elemen)
    });
    test('KJP tanpa label di baris sendiri TIDAK di-split', () => {
      // "5049488500001234 lansia" → ["5049488500001234 lansia"] (1 elemen)
    });
    test('label kartu di depan KJP TIDAK di-split', () => {
      // "lansia 5049488500001234" → ["lansia 5049488500001234"] (1 elemen)
    });
    test('full 4 baris benar dengan label TIDAK berubah', () => {
      // "Budi\nKJP 5049488500001234 lansia\nKTP 3175065310890022\nKK 3175061208160078" → 4 lines unchanged
    });
    test('full 4 baris benar tanpa label TIDAK berubah', () => {
      // "Budi\n5049488500001234\n3175065310890022\n3175061208160078" → 4 lines unchanged
    });
    test('full 4 baris benar Pasarjaya (5 baris) TIDAK berubah', () => {
      // "Budi\n5049488500001234\n3175065310890022\n3175061208160078\n15-08-1990" → 5 lines unchanged
    });
  });
  ```

  **Must NOT do**:
  - Jangan ubah existing test cases
  - Jangan ubah mock setup yang sudah ada

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: Menulis test berdasarkan spec yang jelas
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T1)
  - **Blocks**: T3
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/tests/parser.test.ts` — Existing test file. Lihat pattern import, mock setup, dan assertion style.
  - `src/tests/helpers.ts` — Mock factories jika dibutuhkan.

  **Test References**:
  - `src/tests/parser.test.ts` — Cari `describe('parseRawMessageToLines')` untuk existing tests. Tambah test baru di sini.

  **WHY Each Reference Matters**:
  - parser.test.ts: Harus ikuti pattern mock yang sama (mock.module + dynamic import) agar tidak conflict dengan test lain

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Semua test pass
    Tool: Bash
    Steps:
      1. bun test --isolate src/tests/parser.test.ts
      2. Assert: 0 failures
    Expected Result: Semua test (existing + baru) pass
    Evidence: .sisyphus/evidence/task-2-test-results.txt

  Scenario: Full suite tidak regress
    Tool: Bash
    Steps:
      1. bun test --isolate
      2. Assert: tidak ada failure baru (hanya pre-existing failures di time.test.ts dan messages.test.ts)
    Expected Result: Tidak ada regression
    Evidence: .sisyphus/evidence/task-2-full-suite.txt
  ```

  **Commit**: YES (group with T1)
  - Message: `test(parser): test split baris Nama+KJP dan KJP+NIK nyatu`
  - Files: `src/tests/parser.test.ts`
  - Pre-commit: `bun test --isolate src/tests/parser.test.ts`

---

- [x] 3. Full Regression + Build Verification

  **What to do**:
  - Jalankan `bunx tsc --noEmit` — harus 0 error
  - Jalankan `bun test --isolate` — semua test pass (kecuali pre-existing failures)
  - Verifikasi tidak ada file yang berubah selain `src/parser.ts` dan `src/tests/parser.test.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: T1, T2

  **Acceptance Criteria**:

  ```
  Scenario: Build clean
    Tool: Bash
    Steps:
      1. bunx tsc --noEmit
      2. Assert exit code 0
    Expected Result: 0 TypeScript errors
    Evidence: .sisyphus/evidence/task-3-build.txt

  Scenario: Full test suite
    Tool: Bash
    Steps:
      1. bun test --isolate
      2. Count pass/fail
    Expected Result: Semua pass kecuali pre-existing (time.test.ts, messages.test.ts)
    Evidence: .sisyphus/evidence/task-3-full-suite.txt

  Scenario: Scope check
    Tool: Bash
    Steps:
      1. git diff --stat
      2. Assert: hanya parser.ts dan parser.test.ts yang berubah
    Expected Result: Tidak ada file lain yang termodifikasi
    Evidence: .sisyphus/evidence/task-3-scope.txt
  ```

  **Commit**: NO (sudah di-commit di T1+T2)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `review`
  Run `bunx tsc --noEmit` + `bun test --isolate`. Review parser.ts changes for: regex correctness, edge case handling, no `as any`/`@ts-ignore`, no empty catches, no console.log.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `testing`
  Execute EVERY QA scenario from T1 — follow exact steps, capture evidence. Test all 6 sub-pola with exact user input from contoh kasus.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files |
|------|---------------|-------|
| 1+2 | `fix(parser): pecah baris Nama+KJP dan KJP+NIK yang nyatu` | `src/parser.ts`, `src/tests/parser.test.ts` |

---

## Success Criteria

### Verification Commands
```bash
bunx tsc --noEmit          # Expected: 0 errors
bun test --isolate         # Expected: all pass (except pre-existing)
```

### Final Checklist
- [ ] Semua 6 contoh kasus nyata user menghasilkan 4 baris
- [ ] **Format yang sudah benar TIDAK terganggu** (KJP+label di baris sendiri tetap 1 baris)
- [ ] **Data 4 baris benar tetap 4 baris** (tidak jadi 5 atau lebih)
- [ ] Existing auto-split (Nama+angka) tidak regress
- [ ] Existing label-merge (KTP\n317...) tidak regress
- [ ] Single label+number (NIK 317...) tidak di-split
- [ ] Build clean, tests pass
