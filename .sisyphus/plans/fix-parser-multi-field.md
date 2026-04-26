# Plan: Fix Parser Multi-Field per Baris

> Perbaikan parser untuk menangani 3+ field per baris, tanda `=`, titik trailing, dan pasangan non-KJP.

## TL;DR

Enhance `parseRawMessageToLines()` di `src/parser.ts` untuk menangani 4 pola input nyata yang gagal:
1. 3 field satu baris (KJP+NIK+KK) — split iteratif
2. Tanda `=` setelah label (`Kjp =504...`) — normalisasi di sanitasi
3. Titik trailing di angka (`504948...25.`) — strip di sanitasi
4. Pasangan non-KJP satu baris (NIK+KK) — tahap split baru

## Interview Summary

### Keputusan User
1. Urutan posisional cukup — baris 3 = KTP, baris 4 = KK, tidak perlu reorder berdasarkan label
2. Angka bare tanpa label: OK split berdasarkan posisi
3. Parser hanya split baris, tidak pernah ubah digit
4. Risiko KTP/KK tertukar: "ga usah, karena sudah pake rumus"

### 4 Pola Gagal (dari live WA test)
- **C1**: `Sapia\n5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk` → 3 field 1 baris
- **C2**: `Candra\nKjp =5049488504454660\nNik 3172044111830009                    Kk 3175060802111021` → `=` + NIK+KK merged
- **C3**: `Kennan\nKJP 5049488509351119                              KTP 3173015903900013                                KK 3173012011100025` → 3 field 1 baris
- **C4**: `Abdi\n5049488500496525.                          3173014602790008.                         3173011601094325` → titik + 3 field

### Metis Gap Analysis
- `=` normalisasi HARUS sebelum `:+`→`:` (urutan penting)
- Trailing dot: gunakan `\.+` (multiple dots)
- Tahap 1 TIDAK perlu dimodifikasi — tambah Tahap 1.5 saja (generic multi-number splitter)
- Guard: hanya split jika baris punya ≥2 angka 16-digit terpisah

## Scope Locks
- JANGAN modifikasi `extractCardNumber`, `extractCardText`, `extractDigits`, `groupLinesToBlocks`, `buildParsedFields`
- JANGAN sentuh `wa.ts`
- JANGAN tambah dependency baru
- JANGAN ubah behavior untuk input 4-baris atau 5-baris yang sudah benar
- JANGAN tambah reorder field berdasarkan label

## Dependency Matrix

```
T1 (sanitasi) → T2 (multi-number split) → T3 (unit test) → T4 (regression)
```

T1 dan T2 sequential (T2 bergantung pada sanitasi T1). T3 dan T4 bisa parallel setelah T2.

---

## Wave 1: Foundation (Sequential)

### - [x] T1: Normalisasi Sanitasi — `=` dan Trailing Dot

**File**: `src/parser.ts`
**Lokasi**: Line 335-337 (sanitasi chain di `parseRawMessageToLines`)

**Apa yang dilakukan**:
1. Tambah `.replace(/=/g, ':')` SEBELUM `.replace(/:+/g, ':')` — normalisasi `=` ke `:`
2. Tambah `.replace(/(\d)\.+(?=\s|$)/g, '$1')` — strip trailing dot(s) setelah angka, hanya jika diikuti whitespace atau end-of-string
3. Urutan chain: sanitizeInboundText → disablitas fix → `=`→`:` → `:+`→`:` → trailing dot strip

**Urutan sanitasi setelah fix**:
```typescript
const sanitized = sanitizeInboundText(text)
    .replace(/\bdisablitas\b/gi, 'Disabilitas')
    .replace(/=/g, ':')           // ★ BARU: = → :
    .replace(/:+/g, ':')          // existing: :: → :
    .replace(/(\d)\.+(?=\s|$)/g, '$1');  // ★ BARU: strip trailing dots
```

**MUST DO**:
- `=` normalisasi HARUS sebelum `:+` normalisasi (agar `=:` → `::` → `:`)
- Trailing dot regex HARUS require digit sebelum dot (`(\d)\.+`) — jangan strip dot di nama seperti `Hj.`
- Trailing dot regex HARUS require whitespace atau EOL setelah dot (`(?=\s|$)`) — jangan strip `5049...25.317...` (dot tanpa spasi)

**MUST NOT DO**:
- Jangan ubah `sanitizeInboundText()` di textSanitizer.ts
- Jangan ubah regex lain di sanitasi chain

**Acceptance Criteria**:
- `"Kjp =5049488504454660"` → setelah sanitasi → `"Kjp :5049488504454660"`
- `"Nik=317..."` → `"Nik:317..."`
- `"5049488500496525.  "` → `"5049488500496525  "`
- `"5049488500496525..  "` → `"5049488500496525  "` (multiple dots)
- `"Hj. Siti"` → `"Hj. Siti"` (dot setelah huruf, TIDAK distrip)
- `"5049488500496525.317..."` → `"5049488500496525.317..."` (dot tanpa spasi, TIDAK distrip)
- Semua 117 existing parser test TETAP pass

**QA**:
- Tool: `bun test --isolate src/tests/parser.test.ts`
- Tool: `bunx tsc --noEmit`

**Commit**: `fix(parser): normalisasi = dan strip trailing dot di sanitasi`

---

### - [x] T2: Tahap 1.5 — Generic Multi-Number Splitter

**File**: `src/parser.ts`
**Lokasi**: Sisipkan antara Tahap 1 (line ~412) dan Tahap 2 (line ~414)

**Apa yang dilakukan**:
Tambah tahap baru yang memecah baris berisi ≥2 angka 16-digit menjadi baris terpisah.

**Algoritma**:
```
Untuk setiap baris di afterKjpNikSplit:
  1. Cari semua posisi angka 16-digit (\d{16}) di baris
  2. Jika < 2 angka ditemukan → push baris utuh, skip
  3. Jika ≥ 2 angka ditemukan:
     a. Untuk setiap angka (kecuali yang pertama), cari split point:
        - Jika ada label keyword (nik/ktp/kk/kjp/lansia/dll) sebelum angka → split sebelum label
        - Jika tidak ada label → split sebelum angka itu sendiri
     b. Split baris di semua split points
     c. Trim setiap bagian, push yang non-empty
```

**Detail implementasi**:
- Gunakan `/\d{16}/g` dengan `exec()` loop untuk menemukan semua posisi angka 16-digit
- Untuk setiap angka setelah yang pertama, scan mundur dari posisi angka untuk menemukan label keyword
- Label keywords: sama dengan yang ada di isLabel guard (line 511) + card type labels
- Split point = awal label jika ada, atau awal angka jika tidak ada label
- Iteratif: satu pass cukup karena kita menemukan SEMUA angka sekaligus

**Guard**:
- HANYA aktif jika baris punya ≥2 match `\d{16}`
- Baris dengan 1 angka 16-digit → pass through tanpa perubahan
- Baris tanpa angka 16-digit → pass through

**Contoh trace**:
```
Input: "5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk"
Angka ditemukan: [pos 0: 5049488507461944, pos 21: 3175064905830028, pos 42: 3175062511131032]
Split point 2: "nik" label sebelum angka 2 → split di pos 38 (awal "nik")
Split point 3: sebelum angka 3 → scan mundur, tidak ada label → split di pos 42
Hasil: ["5049488507461944 kjp", "3175064905830028 nik", "3175062511131032 kk"]
```

Wait — angka 3 punya "kk" SETELAH angka, bukan sebelum. Dan "nik" ada sebelum angka 2. Mari trace ulang:

```
Input: "5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk"
                   ^kjp label setelah angka 1
                                        ^nik label sebelum angka 3? Tidak — "nik" ada SETELAH angka 2.
```

Hmm, ini tricky. Label bisa muncul SEBELUM atau SESUDAH angka. Strategi yang lebih robust:

**Strategi revisi**: Cari semua angka 16-digit. Untuk setiap pasangan angka berurutan, cari titik split di antara mereka. Titik split = posisi label keyword terdekat ke angka kedua (scan mundur dari angka kedua). Jika tidak ada label, split di boundary whitespace terdekat ke angka kedua.

```
Input: "5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk"
Angka: [0:16, 21:37, 42:58]
Antara angka 1 dan 2: " kjp " (pos 16-21). Label "kjp" ada di pos 17. Split sebelum "kjp"? Tidak — "kjp" adalah label untuk angka 1 (setelah angka). Split seharusnya SETELAH "kjp" dan sebelum angka 2.
→ Split point = pos 21 (awal angka 2)
Antara angka 2 dan 3: " nik " (pos 37-42). Label "nik" ada di pos 38. Split sebelum "nik".
→ Split point = pos 38

Hasil: ["5049488507461944 kjp", "3175064905830028 nik", "3175062511131032 kk"]
```

Ini benar! Strategi: split SEBELUM label keyword yang mendahului angka berikutnya. Jika tidak ada label, split sebelum angka itu sendiri (di whitespace boundary).

**Strategi final**:
```
1. Temukan semua posisi angka 16-digit: matches[]
2. Jika matches.length < 2 → skip
3. splitPoints = [0] (awal baris)
4. Untuk i = 1 sampai matches.length - 1:
   a. Ambil region antara akhir matches[i-1] dan awal matches[i]
   b. Scan region untuk label keyword terakhir (paling dekat ke matches[i])
   c. Jika ada label → splitPoint = posisi awal label di baris asli
   d. Jika tidak ada label → splitPoint = awal whitespace terdekat sebelum matches[i]
5. Split baris di semua splitPoints
6. Trim dan push
```

**MUST DO**:
- Tahap ini HARUS disisipkan SETELAH Tahap 1 (afterKjpNikSplit) dan SEBELUM Tahap 2 (afterNameKjpSplit)
- Variable input: `afterKjpNikSplit`, output: `afterMultiNumberSplit`
- Tahap 2 harus diubah untuk iterate `afterMultiNumberSplit` (bukan `afterKjpNikSplit`)
- Guard: ≥2 angka 16-digit per baris
- Label keywords untuk scan: `(?:(?:no(?:mor|mer)?)\s+)?(?:nik|ktp|kk|kjp|kpj|kaj|kpdj|kjmu|lansia|klj|lns|ls|rusun|disabilitas|disablitas|dasawisma|dawis|guru|honorer|pekerja|pkja|pkj|pjlp|difabel|cacat|kartu(?:\s+(?:keluarga|jakarta\s+pintar|pekerja(?:\s+jakarta)?))?|atm)`
- Case-insensitive matching

**MUST NOT DO**:
- Jangan modifikasi Tahap 1 (afterKjpNikSplit) — biarkan apa adanya
- Jangan modifikasi Tahap 2 (afterNameKjpSplit) selain mengganti input variable
- Jangan modifikasi auto-split (finalLines)
- Jangan reorder field berdasarkan label

**Acceptance Criteria**:
- C1: `"5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk"` → 3 baris
- C2 line 2 (setelah sanitasi): `"Nik 3172044111830009                    Kk 3175060802111021"` → 2 baris
- C3 line 2 (setelah Tahap 1 split KJP): `"KTP 3173015903900013                                KK 3173012011100025"` → 2 baris
- C4 line 2 (setelah sanitasi strip dot + Tahap 1 split KJP): `"3173014602790008                         3173011601094325"` → 2 baris
- Single `"KTP 3173015903900013"` → TIDAK dipecah (1 angka saja)
- Single `"5049488500001234"` → TIDAK dipecah
- 4-baris benar → TIDAK berubah

**Full message tests**:
- C1 full: `"Sapia\n5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk"` → 4 baris
- C2 full: `"Candra\nKjp =5049488504454660\nNik 3172044111830009                    Kk 3175060802111021"` → 4 baris
- C3 full: `"Kennan\nKJP 5049488509351119                              KTP 3173015903900013                                KK 3173012011100025"` → 4 baris
- C4 full: `"Abdi\n5049488500496525.                          3173014602790008.                         3173011601094325"` → 4 baris

**QA**:
- Tool: `bun test --isolate src/tests/parser.test.ts`
- Tool: `bunx tsc --noEmit`
- Semua 117+ existing test TETAP pass

**Commit**: `fix(parser): split multi-field per baris dan pasangan non-KJP`

---

## Wave 2: Testing (Parallel)

### - [x] T3: Unit Tests — 4 Pola Baru + Regression

**File**: `src/tests/parser.test.ts`
**Lokasi**: Tambah describe block baru setelah existing `parseRawMessageToLines` tests

**Apa yang dilakukan**:
Tambah test cases untuk semua 4 pola baru + regression guards.

**Test cases WAJIB** (minimal 16 test):

**Sanitasi (4 test)**:
1. `"Kjp =5049488504454660"` → `["Kjp :5049488504454660"]` (= → :)
2. `"Nik=3172044111830009"` → `["Nik:3172044111830009"]` (= tanpa spasi)
3. `"5049488500496525.  3173014602790008"` → dot stripped, 2 angka terpisah
4. `"Hj. Siti"` → `["Hj. Siti"]` (dot di nama TIDAK distrip)

**Multi-number split (6 test)**:
5. C1 full message: `"Sapia\n5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk"` → 4 baris
6. C2 full message: `"Candra\nKjp =5049488504454660\nNik 3172044111830009                    Kk 3175060802111021"` → 4 baris
7. C3 full message: `"Kennan\nKJP 5049488509351119                              KTP 3173015903900013                                KK 3173012011100025"` → 4 baris
8. C4 full message: `"Abdi\n5049488500496525.                          3173014602790008.                         3173011601094325"` → 4 baris
9. NIK+KK saja (tanpa KJP di baris): `"Nik 3172044111830009 Kk 3175060802111021"` → 2 baris
10. 3 bare numbers tanpa label: `"5049488500496525 3173014602790008 3173011601094325"` → 3 baris

**Regression (6 test)**:
11. 4-baris benar tetap utuh: `"Budi\nKJP 5049488500001234\nKTP 3173015903900013\nKK 3173012011100025"` → 4 baris
12. Single `"NIK 3173015903900013"` → 1 baris (TIDAK dipecah)
13. Single `"KTP 3173015903900013"` → 1 baris (TIDAK dipecah)
14. 5-baris Pasarjaya tetap utuh
15. Auto-split `"Agus Dalimin 5049488500001111"` → 2 baris (tetap jalan)
16. Label-merge `"KTP\n3175065310890022"` → 1 baris merged (tetap jalan)

**MUST DO**:
- Gunakan `parseRawMessageToLines` langsung (sudah di-import di test file)
- Assert dengan `toEqual([...])` untuk exact content, `toHaveLength(N)` untuk count
- Setiap test case harus punya deskripsi jelas dalam bahasa Indonesia

**MUST NOT DO**:
- Jangan ubah existing test cases
- Jangan tambah mock baru (parseRawMessageToLines tidak butuh mock)

**QA**:
- Tool: `bun test --isolate src/tests/parser.test.ts`
- Semua test (existing + baru) harus pass

**Commit**: `test(parser): tambah test multi-field, sanitasi =, trailing dot`

---

### - [x] T4: Full Regression + Build Verification

**Apa yang dilakukan**:
1. Jalankan `bunx tsc --noEmit` — harus 0 error
2. Jalankan `bun test --isolate` — full suite, cek tidak ada failure baru
3. Jalankan `git diff --stat` — pastikan hanya `src/parser.ts` dan `src/tests/parser.test.ts` yang berubah
4. Grep anti-pattern: `as any`, `@ts-ignore`, `TODO`, `FIXME`, `HACK` di file yang berubah

**Acceptance Criteria**:
- tsc: 0 error
- bun test: semua pass (kecuali pre-existing failures di time.test.ts dan messages.test.ts)
- git diff: hanya 2 file berubah
- 0 anti-pattern baru

**Commit**: tidak ada (verification only)

---

## Final Verification Wave

### - [x] F1: Plan Compliance Audit
**Agent**: Oracle
**Cek**: Must Have semua terpenuhi, Must NOT Have semua dihormati, semua task [x]

### - [x] F2: Code Quality Review
**Agent**: Oracle
**Cek**: Build pass, test pass, 0 anti-pattern, regex quality, guard correctness

### - [x] F3: Manual QA
**Agent**: Testing
**Cek**: Jalankan semua 4 pola C1-C4 sebagai full message, verifikasi output exact

### - [x] F4: Scope Fidelity Check
**Agent**: Deep
**Cek**: Hanya parser.ts dan parser.test.ts berubah, tidak ada scope creep

---

## Commit Strategy

| Task | File | Commit Message |
|------|------|---------------|
| T1 | parser.ts | `fix(parser): normalisasi = dan strip trailing dot di sanitasi` |
| T2 | parser.ts | `fix(parser): split multi-field per baris dan pasangan non-KJP` |
| T3 | parser.test.ts | `test(parser): tambah test multi-field, sanitasi =, trailing dot` |

---

## Definition of Done

- [x] Semua 4 pola (C1-C4) menghasilkan 4 baris dari input 2-3 baris
- [x] `=` setelah label dinormalisasi ke `:`
- [x] Trailing dot di angka distrip
- [x] Pasangan non-KJP (NIK+KK) satu baris dipecah
- [x] Semua existing test tetap pass (0 regression)
- [x] tsc clean
- [x] F1-F4 semua APPROVE
