# Unit Test Audit — Comprehensive Plan

## Objective
Write comprehensive unit tests for ALL features of the KJP WhatsApp bot. Report bugs found — do NOT fix code during this audit.

## Constraints
- **Bun test** framework (already configured)
- **Existing tests**: 6 files in `src/tests/`, 58 tests, 175 expect() — all location-related
- **Test pattern**: `bun:test` imports, `mock.module()` for dependency injection
- **DO NOT** modify source code — tests only
- **DO NOT** fix bugs — report them in a bug list at the end
- **All test files** go in `src/tests/`

## Execution Waves

### Wave 1: Pure Logic — Core Parsing & Utilities (HIGH PRIORITY)
**No mocking needed. Direct function imports.**

---

#### Task 1: `parser.test.ts` — Parser Core Functions
**File**: `src/tests/parser.test.ts`
**Category**: `implementation`
**Source**: `src/parser.ts`
**Estimated tests**: ~80

**Functions to test:**

1. **`extractDigits(text)`** (line 26)
   - Input: `'KJP 5049488500001234'` → `'5049488500001234'`
   - Input: `'abc'` → `''`
   - Input: `''` / `null` → `''`

2. **`extractCardNumber(text)`** (line 33)
   - Input: `'KJP 5049488500001234'` → `'5049488500001234'`
   - Input: `'5049488500001234'` → `'5049488500001234'`
   - Input: `'KJP5049488500001234'` → `'5049488500001234'`
   - Input: `'504948850000'` → digits (short card)
   - Input: `'abc'` → `''`

3. **`extractCardText(text)`** (line 62)
   - Input: `'KJP 5049488500001234'` → `'KJP'`
   - Input: `'LANSIA 5049488500001234'` → `'LANSIA'`
   - Input: `'5049488500001234'` → `''`

4. **`normalizeCardType(text)`** (line 72)
   - Input: `'kjp'` → `'KJP'`
   - Input: `'lansia'` → `'LANSIA'`
   - Input: `''` → `null`

5. **`resolveJenisKartu(prefix8, cardText, noKjp)`** (line 76)
   - KJP prefix → `{ jenis_kartu: 'KJP', sumber: 'prefix' }`
   - Manual text override
   - Unknown prefix + no text → default KJP
   - Koreksi scenarios

6. **`calculateAgeYearsWib(birthDate, now)`** (line 146)
   - Normal age calculation
   - Birthday today
   - Edge: Feb 29 birthday

7. **`parseNikBirthData(nik)`** (line 157)
   - Valid NIK 16 digits → birth date + age
   - Female NIK (day+40)
   - Short NIK → null
   - Invalid date in NIK → null

8. **`applyNikAgeWarnings(items)`** (line 202)
   - Items with underage NIK → warning added
   - Items without NIK → no warning
   - Items with adult NIK → no warning

9. **`applyUnknownRegionWarnings(items)`** (line 228)
   - Items with unknown region KTP → warning
   - Items with known region → no warning

10. **`cleanName(raw)`** (line 246)
    - Normal name → cleaned
    - Name with blacklisted words → stripped
    - Extra spaces → collapsed
    - Empty → `''`

11. **`normalizeNameForDedup(raw)`** (line 275)
    - `'  Budi  Santoso  '` → `'budi santoso'`
    - `'BUDI-SANTOSO'` → `'budi santoso'`
    - Special chars stripped
    - Empty → `''`

12. **`parseRawMessageToLines(text)`** (line 333)
    - Single block 4 lines → 4 lines
    - Multiple blocks → correct line array
    - Label-only lines merged with next
    - Extra whitespace trimmed

13. **`groupLinesToBlocks(lines, linesPerBlock)`** (line 403)
    - 4 lines, block=4 → 1 block, 0 remainder
    - 8 lines, block=4 → 2 blocks, 0 remainder
    - 5 lines, block=4 → 1 block, 1 remainder
    - 0 lines → 0 blocks

14. **`buildParsedFields(block, location)`** (line 418)
    - PASARJAYA block (5 lines) → includes tanggal_lahir
    - DHARMAJAYA block (4 lines) → includes jenis_kartu
    - FOOD_STATION block (4 lines) → same as DHARMAJAYA path

15. **`parseBlockToItem(block, index, location, specificLocation)`** (line 297)
    - Valid 4-line block → parsed item with status 'ok'
    - Block with invalid KJP → errors array populated

16. **`validateBlockToItem(item, location)`** (line 541)
    - Valid item → status 'ok'
    - Short nama (<3 chars) → error
    - Invalid KJP (wrong prefix, short) → error
    - Invalid KTP (not 16 digits) → error
    - Invalid KK (not 16 digits) → error
    - PASARJAYA: missing tanggal_lahir → error
    - PASARJAYA: invalid tanggal_lahir → error
    - Swapped KTP/KK detection

17. **`buildDuplicateInMessageDetail(items, triggerIdx)`** (line 455)
    - Duplicate KJP within message → detail string
    - Duplicate KTP within message → detail string
    - No duplicates → empty/null

18. **`applyDuplicateNameHardBlockInMessage(items)`** (line 511)
    - Same canonical name → blocked
    - Different names → no block
    - Case-insensitive matching

**QA**:
- `bun test src/tests/parser.test.ts` → all pass
- `lsp_diagnostics` on test file → zero errors

---

#### Task 2: `time.test.ts` — Time Utilities
**File**: `src/tests/time.test.ts`
**Category**: `quick`
**Source**: `src/time.ts`
**Estimated tests**: ~25

**Functions to test:**

1. **`getWibParts(date)`** (line 9)
   - UTC midnight → WIB +7 hours
   - Known date → correct year/month/day/hour/minute/second

2. **`formatIsoDateFromParts(parts)`** (line 22)
   - `{ year: 2026, month: 4, day: 24 }` → `'2026-04-24'`
   - Single-digit month/day → zero-padded

3. **`getWibIsoDate(date)`** (line 26)
   - UTC date → WIB date string
   - Date near midnight UTC → correct WIB date (may differ)

4. **`getStartOfWibMonthUTC(date)`** (line 30)
   - Mid-month → first of month in UTC
   - January → correct

5. **`getStartOfNextWibMonthUTC(date)`** (line 36)
   - Mid-month → first of next month
   - December → January next year

6. **`isLastDayOfWibMonth(date)`** (line 44)
   - Last day of month → true
   - Not last day → false
   - Feb 28/29 handling

7. **`getWibTimeHHmm(date)`** (line 50)
   - Known time → `'HH.MM'` format

8. **`isSystemClosed(date, settings?)`** (line 60)
   - Default settings: 00:00-06:05 → closed
   - Default settings: 07:00 → open
   - Custom settings: 09:00-12:00 → closed at 10:00
   - Cross-midnight: 23:00-04:00 → closed at 01:00
   - Same start/end → never closed
   - Manual close override: within range → closed
   - Manual close override: outside range → open

9. **`getProcessingDayKey(now)`** (line 123)
   - Returns WIB ISO date

10. **`shiftIsoDate(iso, deltaDays)`** (line 127)
    - `'2026-04-24'`, +1 → `'2026-04-25'`
    - `'2026-04-24'`, -1 → `'2026-04-23'`
    - Month boundary: `'2026-04-30'`, +1 → `'2026-05-01'`
    - Invalid input → returns input unchanged

**QA**:
- `bun test src/tests/time.test.ts` → all pass

---

#### Task 3: `dateParser.test.ts` — Date Parsing
**File**: `src/tests/dateParser.test.ts`
**Category**: `quick`
**Source**: `src/utils/dateParser.ts`
**Estimated tests**: ~30

**Functions to test:**

1. **`parseFlexibleDate(input)`** (line 11)
   - `'20-01-2025'` → `'2025-01-20'`
   - `'20/01/2025'` → `'2025-01-20'`
   - `'20.01.2025'` → `'2025-01-20'`
   - `'20012025'` → `'2025-01-20'` (compact 8-digit)
   - `'200125'` → `'2025-01-20'` (compact 6-digit)
   - `'20 01 2025'` → `'2025-01-20'` (spaces)
   - `'20 Januari 2025'` → `'2025-01-20'` (text month)
   - `'20-Jan-2025'` → `'2025-01-20'`
   - `'20  -  01  -  2025'` → `'2025-01-20'` (messy)
   - Labels: `'TGL LAHIR 20-01-2025'` → `'2025-01-20'`
   - 2-digit year: `'200190'` → `'1990-01-20'`
   - 2-digit year: `'200125'` → `'2025-01-20'`
   - Invalid: `'32-01-2025'` → `null` (day > 31)
   - Invalid: `'20-13-2025'` → `null` (month > 12)
   - Invalid: `''` → `null`
   - Invalid: `'abc'` → `null`

2. **`looksLikeDate(input)`** (line 127)
   - `'20-01-2025'` → `true`
   - `'20 Januari 2025'` → `true`
   - `'20012025'` → `true`
   - `'Budi Santoso'` → `false`
   - `'5049488500001234'` → `false` (16 digits, not date)
   - `''` → `false`

**QA**:
- `bun test src/tests/dateParser.test.ts` → all pass

---

#### Task 4: `textSanitizer.test.ts` — Text Sanitization
**File**: `src/tests/textSanitizer.test.ts`
**Category**: `quick`
**Source**: `src/utils/textSanitizer.ts`
**Estimated tests**: ~15

**Functions to test:**

1. **`sanitizeInboundText(raw)`** (line 6)
   - Normal text → unchanged
   - Unicode invisible chars (ZWNJ, BOM, etc.) → stripped
   - Unicode spaces (NBSP, etc.) → regular space
   - `\r\n` → `\n`
   - `\r` → `\n`
   - `null`/`undefined` → `''`

2. **`sanitizeInlineText(raw)`** (line 16)
   - Multiple spaces → single space
   - Leading/trailing whitespace → trimmed
   - Combines sanitizeInboundText + collapse

**QA**:
- `bun test src/tests/textSanitizer.test.ts` → all pass

---

#### Task 5: `contactUtils.test.ts` — Phone Normalization
**File**: `src/tests/contactUtils.test.ts`
**Category**: `quick`
**Source**: `src/utils/contactUtils.ts`
**Estimated tests**: ~20

**Functions to test:**

1. **`normalizePhone(input)`** (line 10)
   - `'08123456789'` → `'628123456789'`
   - `'628123456789'` → `'628123456789'`
   - `'8123456789'` → `'8123456789'` (no prefix change)
   - `''` → `''`

2. **`normalizeManualPhone(input)`** (line 23)
   - `'+628123456789'` → `'628123456789'`
   - `'08123456789'` → `'628123456789'`
   - `'8123456789'` → `'628123456789'`
   - `'12345'` → `null` (too short)
   - `''` → `null`

3. **`extractManualPhone(text)`** (line 45)
   - `'nohp: 08123456789'` → normalized
   - `'hp:08123456789'` → normalized
   - `'kirim ke 08123456789 ya'` → normalized
   - `'tidak ada nomor'` → `null`

4. **`isLidJid(jid)`** (line 68)
   - `'12345@lid'` → `true`
   - `'628123456789@s.whatsapp.net'` → `false`
   - `''` → `false`

**QA**:
- `bun test src/tests/contactUtils.test.ts` → all pass

---

#### Task 6: `cardType.test.ts` — Card Type Resolution
**File**: `src/tests/cardType.test.ts`
**Category**: `quick`
**Source**: `src/utils/cardType.ts` + `src/utils/cardTypeRules.ts`
**Estimated tests**: ~25

**Functions to test:**

1. **`normalizeCardTypeName(text)`** (cardTypeRules.ts line 45)
   - `'kjp'` → `'KJP'`
   - `'lansia'` → `'LANSIA'`
   - `'kartu pekerja jakarta'` → `'PEKERJA'`
   - `'difabel'` → `'DISABILITAS'`
   - `'dawis'` → `'DASAWISMA'`
   - `'guru honorer'` → `'GURU HONORER'`
   - `'pjlp'` → `'PJLP'`
   - `'kaj'` → `'KAJ'`
   - `'unknown'` → `null`
   - `''` → `null`
   - Case insensitive: `'KJP'` → `'KJP'`
   - Partial match in text: `'ini kartu lansia saya'` → `'LANSIA'`

2. **`getCardTypeChoicesText()`** (cardTypeRules.ts line 79)
   - Returns expected string with all card types

3. **`resolveCardTypeLabel(noKjp, jenisKartu)`** (cardType.ts line 3)
   - Manual jenis_kartu provided → returns it
   - No manual, KJP prefix → resolved from prefix
   - No manual, no prefix match → `'KJP'` default
   - Note: This calls `getCardPrefixType` which reads file — may need mock

**QA**:
- `bun test src/tests/cardType.test.ts` → all pass

---

### Wave 2: Pure Logic — Reply, Messages, Helpers (MEDIUM PRIORITY)

---

#### Task 7: `supabaseHelpers.test.ts` — Supabase Pure Helpers
**File**: `src/tests/supabaseHelpers.test.ts`
**Category**: `implementation`
**Source**: `src/supabase.ts` (pure functions only)
**Estimated tests**: ~30

**Functions to test** (all are non-exported but testable via re-export or direct import):

Note: Many of these are `function` (not `export function`). Need to check which are exported.

1. **`normalizeKjp(raw)`** (line 405) — strips non-digits
2. **`normalizeKk(raw)`** (line 401) — strips non-digits
3. **`normalizePhoneNumber(raw)`** (line 409) — `0xxx` → `62xxx`, `8xxx` → `628xxx`
4. **`normalizeLocationKey(raw)`** (line 416) — trim + collapse spaces
5. **`normalizeNameForDedup(raw)`** (line 391) — lowercase, strip special chars, collapse spaces
6. **`groupGlobalQuotaUsageDeltas(deltas)`** (line 426) — groups by location+day
7. **`buildPhoneCandidates(phone)`** (line 846) — generates phone variants
8. **`formatCloseTimeString(settings)`** (line 2736) — formats close time
9. **`formatOpenTimeString(settings)`** (line 2743) — formats open time
10. **`stripLegacyCloseNote(text)`** (line 2747) — removes legacy close lines
11. **`renderCloseMessage(settings)`** (line 2759) — renders close message with template
12. **`shiftDateString(dateStr, delta)`** (line 2420) — shifts date
13. **`toGlobalLocationQuotaDecision(row, requestedCount)`** (line 510) — computes quota decision

**IMPORTANT**: Check which functions are exported. Non-exported functions cannot be tested directly — note this in bug report if critical logic is non-exported.

**QA**:
- `bun test src/tests/supabaseHelpers.test.ts` → all pass

---

#### Task 8: `statusCheckService.test.ts` — Status Check Pure Functions
**File**: `src/tests/statusCheckService.test.ts`
**Category**: `quick`
**Source**: `src/services/statusCheckService.ts`
**Estimated tests**: ~20

**Functions to test** (non-exported pure functions — may need re-export):

1. **`toPositiveInt(raw, fallback)`** (line 5)
   - `'15000'`, 10000 → 15000
   - `'0'`, 10000 → 10000 (not positive)
   - `'-5'`, 10000 → 10000
   - `undefined`, 10000 → 10000
   - `'abc'`, 10000 → 10000

2. **`parseIsoDateUtc(dateIso)`** (line 18)
   - `'2026-04-24'` → Date object
   - `'invalid'` → null

3. **`shiftIsoDate(dateIso, deltaDays)`** (line 26)
   - `'2026-04-24'`, 1 → `'2026-04-25'`
   - Invalid → returns input

4. **`formatLongIndonesianDate(dateIso)`** (line 35)
   - `'2026-04-24'` → Indonesian long date format

5. **`formatIndonesianDateWithoutWeekday(dateIso)`** (line 49)
   - `'2026-04-24'` → Indonesian date without weekday

6. **`normalizeProgramLabel(jenisKartu)`** (line 82)
   - `'KJP'` → `'KJP'`
   - `null` → `'KJP'`
   - `''` → `'KJP'`

7. **`buildStatusSummaryMessage(results, dateIso)`** (line 155) — EXPORTED
   - All success → correct format
   - Mixed results → correct sections
   - All failed → correct format
   - With errors → includes error section

8. **`buildFailedDataCopyMessage(results)`** (line 200) — EXPORTED
   - No failures → null
   - With failures → header + body format

**NOTE**: Functions 1-6 are NOT exported. Either:
- a) Test via exported functions that call them
- b) Note as "untestable without re-export" in bug report

**QA**:
- `bun test src/tests/statusCheckService.test.ts` → all pass

---

#### Task 9: `recap.test.ts` — Recap Pure Functions
**File**: `src/tests/recap.test.ts`
**Category**: `implementation`
**Source**: `src/recap.ts`
**Estimated tests**: ~25

**Functions to test:**

1. **`buildReplyForTodayRecap(validCount, totalInvalid, validItems, processingDayKey)`** (line 164) — EXPORTED
   - 0 items → "Belum ada data"
   - Multiple items → numbered list with lokasi
   - PASARJAYA item with tanggal_lahir → shows birth date
   - FOOD STATION item → shows "📍 FOOD STATION"
   - DHARMAJAYA item → shows "📍 DHARMAJAYA - Duri Kosambi"

2. **`buildReplyForInvalidDetails(detailItems)`** (line 219) — EXPORTED
   - Empty → "Tidak ada data gagal"
   - With items → formatted error list

3. **`normalizeLocationMeta(lokasi)`** (line 308) — NOT EXPORTED
   - `'DHARMAJAYA - Duri Kosambi'` → `{ parent: 'DHARMAJAYA', subLabel: 'Duri Kosambi', subKey: 'duri kosambi' }`
   - `'PASARJAYA - Jakgrosir Kedoya'` → `{ parent: 'PASARJAYA', ... }`
   - `'FOOD STATION'` → `{ parent: 'FOOD_STATION', subLabel: 'FOOD STATION', subKey: 'food station' }`
   - Unknown → defaults to DHARMAJAYA
   - **NOTE**: Not exported — test via `buildReplyForTodayRecap` or note as untestable

**QA**:
- `bun test src/tests/recap.test.ts` → all pass

---

#### Task 10: `messages.test.ts` — Config Constants Validation
**File**: `src/tests/messages.test.ts`
**Category**: `quick`
**Source**: `src/config/messages.ts`
**Estimated tests**: ~15

**Tests:**
1. `MENU_MESSAGE` contains all 6 menu options
2. `FORMAT_DAFTAR_MESSAGE` contains 3 provider options (PASARJAYA, DHARMAJAYA, FOOD STATION)
3. `FORMAT_DAFTAR_FOOD_STATION` exists and contains 4-line format
4. `PASARJAYA_MAPPING` has 4 entries
5. `DHARMAJAYA_MAPPING` has 4 entries
6. `FAQ_MESSAGE` mentions FOOD STATION
7. All mappings have string values
8. No duplicate mapping keys

**QA**:
- `bun test src/tests/messages.test.ts` → all pass

---

### Wave 3: Mock-Based Tests (HIGH PRIORITY — finds real bugs)

---

#### Task 11: `supabaseCrud.test.ts` — Supabase CRUD Operations
**File**: `src/tests/supabaseCrud.test.ts`
**Category**: `implementation`
**Source**: `src/supabase.ts`
**Estimated tests**: ~40

**Uses**: `mock.module()` pattern from existing `locationGate.test.ts`

**Functions to test:**

1. **`checkDuplicatesBatch(items, senderPhone, processingDayKey)`** (line 145)
   - No duplicates → all items status 'ok'
   - Duplicate KJP (global) → status 'SKIP_DUPLICATE'
   - Duplicate KTP (global) → status 'SKIP_DUPLICATE'
   - Duplicate name (same sender) → status 'SKIP_DUPLICATE'
   - Duplicate name (different sender) → NOT blocked
   - DB error → items unchanged

2. **`saveLogAndOkItems(log)`** (line 1940)
   - Valid log → inserts to data_harian + log_pesan_wa
   - All items failed → no data_harian insert
   - DB error on log → returns logError
   - DB error on data → returns dataError

3. **`checkBlockedKjpBatch(items)`** (line 1273)
   - No blocked KJP → items unchanged
   - Blocked KJP → error added

4. **`checkBlockedKtpBatch(items)`** (line 3277)
   - No blocked KTP → items unchanged
   - Blocked KTP → error added

5. **`checkBlockedKkBatch(items)`** (line 1374)
   - No blocked KK → items unchanged
   - Blocked KK → error added

6. **`checkBlockedLocationBatch(items)`** (line 1423)
   - No blocked location → items unchanged
   - Blocked location → error added
   - Blocked provider → error added

7. **`deleteDailyDataByIndex(senderPhone, processingDayKey, index)`** (line 2135)
   - Valid index → deleted
   - Invalid index → error

8. **`updateDailyDataField(params)`** (line 2804)
   - Update nama → success
   - Update lokasi with quota check → success/fail
   - Food Station lokasi edit → should be blocked upstream (wa.ts)

**QA**:
- `bun test src/tests/supabaseCrud.test.ts` → all pass

---

#### Task 12: `whitelistGate.test.ts` — Whitelist/Access Control
**File**: `src/tests/whitelistGate.test.ts`
**Category**: `implementation`
**Source**: `src/services/whitelistGate.ts`
**Estimated tests**: ~15

**Functions to test:**

1. **`resolveSenderAccess(senderPhone)`**
   - Whitelisted phone → allowed
   - Non-whitelisted → blocked
   - Admin phone → allowed + isAdmin flag

2. **`isAdminPhone(phone)`**
   - Admin number → true
   - Non-admin → false

**QA**:
- `bun test src/tests/whitelistGate.test.ts` → all pass

---

#### Task 13: `excelService.test.ts` — Excel Export
**File**: `src/tests/excelService.test.ts`
**Category**: `implementation`
**Source**: `src/services/excelService.ts`
**Estimated tests**: ~10

**Functions to test:**

1. **`generateKJPExcel(data, processingDayKey)`**
   - DHARMAJAYA data → correct lokasi formatting
   - PASARJAYA data → correct lokasi formatting
   - FOOD STATION data → correct lokasi formatting (not falling to DHARMAJAYA default)
   - Empty data → valid empty Excel
   - Mixed providers → all formatted correctly

**QA**:
- `bun test src/tests/excelService.test.ts` → all pass

---

### Wave 4: Integration Tests

---

#### Task 14: `parserPipeline.test.ts` — Full Parse Pipeline
**File**: `src/tests/parserPipeline.test.ts`
**Category**: `implementation`
**Source**: `src/parser.ts` (`processRawMessageToLogJson`)
**Estimated tests**: ~20

**Tests the full pipeline**: raw message → parse → validate → duplicate check → log JSON

1. **Single valid DHARMAJAYA message** → 1 ok item
2. **Single valid PASARJAYA message** (5 lines) → 1 ok item with tanggal_lahir
3. **Single valid FOOD_STATION message** → 1 ok item
4. **Multi-person message** (8 lines) → 2 ok items
5. **Invalid KJP** → 1 SKIP_FORMAT item
6. **Invalid KTP** → 1 SKIP_FORMAT item
7. **Mixed valid + invalid** → correct split
8. **Remainder lines** → captured in failed_remainder_lines
9. **Duplicate KJP in same message** → duplicate detection
10. **Duplicate name in same message** → hard block

**Requires mocking**: `checkDuplicatesBatch` (Supabase call within pipeline)

**QA**:
- `bun test src/tests/parserPipeline.test.ts` → all pass

---

#### Task 15: `reply.test.ts` — Reply Message Builder
**File**: `src/tests/reply.test.ts`
**Category**: `implementation`
**Source**: `src/reply.ts`
**Estimated tests**: ~20

**Functions to test:**

1. **`buildReplyForNewData(log, allDataTodayItems, locationContext)`**
   - All ok → success message with item list
   - All failed → failure message with error details
   - Mixed → both sections
   - PASARJAYA context → 5-line remainder expectation
   - FOOD_STATION context → 4-line remainder expectation
   - Remainder lines → warning about extra lines

2. **`extractChildName(nama)`** — extract display name
3. **`formatDateDMY(isoDate)`** — `'2025-01-20'` → `'20-01-2025'`
4. **`formatWaPhone(phone)`** — format for display

**QA**:
- `bun test src/tests/reply.test.ts` → all pass

---

## Execution Order

| Wave | Tasks | Parallel? | Est. Tests |
|------|-------|-----------|------------|
| 1 | Tasks 1-6 | Yes (all independent) | ~195 |
| 2 | Tasks 7-10 | Yes (all independent) | ~90 |
| 3 | Tasks 11-13 | Yes (all independent) | ~65 |
| 4 | Tasks 14-15 | Yes (independent) | ~40 |
| **TOTAL** | **15 tasks** | | **~390 tests** |

## Final Verification

After all waves complete:
1. `bun test` — run full suite (existing 58 + new ~390 = ~448 tests)
2. Collect all failures → bug report
3. Categorize bugs: CRITICAL / HIGH / MEDIUM / LOW
4. Write bug fix plan (separate document)

## Non-Exportable Function Audit

During testing, track functions that are NOT exported but contain critical logic:
- `src/supabase.ts`: `normalizeKjp`, `normalizeKk`, `normalizePhoneNumber`, `normalizeLocationKey`, `normalizeNameForDedup`
- `src/services/statusCheckService.ts`: `toPositiveInt`, `parseIsoDateUtc`, `shiftIsoDate`, `formatLongIndonesianDate`, `formatIndonesianDateWithoutWeekday`, `normalizeProgramLabel`
- `src/recap.ts`: `normalizeLocationMeta`, `buildReasonForInvalidItem`, `dedupInvalidItems`

These should be flagged as "recommend export for testability" in the bug report.

## Commit Strategy

- 1 commit per wave (4 total)
- Message format: `Tambah unit test [wave N]: [deskripsi]`
- No source code changes — tests only
