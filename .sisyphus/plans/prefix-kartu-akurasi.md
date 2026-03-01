# Perbaikan Akurasi Prefix Kartu pada 1_SIAPKAN_DATA_HARIAN

## TL;DR
> **Summary**: Ubah klasifikasi jenis kartu dari hardcoded 8-digit map menjadi engine berbasis aturan JSON yang mendukung multi-prefix per jenis, overlap handling, dan keputusan deterministik.
> **Deliverables**:
> - Loader + validator rule JSON prefix kartu
> - Resolver klasifikasi deterministik (longest-prefix -> priority -> ambiguous)
> - Integrasi strict-block policy untuk `UNMATCHED/AMBIGUOUS`
> - Audit trail + laporan mismatch/backtest
> - Skenario verifikasi otomatis berbasis command
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: Task 1 -> Task 2 -> Task 4 -> Task 6

## Context
### Original Request
Pengguna menyampaikan bahwa rumus/prefix di `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py` sudah tidak akurat karena ada jenis kartu dengan angka prefix saling overlap dan 1 jenis punya lebih dari 1 prefix. Pengguna meminta diskusi + planning saja (tanpa edit implementasi sekarang).

### Interview Summary
- Scope tetap pada perbaikan mekanisme klasifikasi prefix kartu (bukan refactor total script).
- Policy operasional dipilih: tetap **blokir total** jika hasil klasifikasi tidak pasti.
- Sumber rule dipilih: **file JSON terpisah** dari script utama.
- Tie-break utama dipilih: **prefix terpanjang menang**.
- User minta plan langsung dibuat; asumsi test strategy ditetapkan oleh planner agar implementer bisa eksekusi tanpa keputusan tambahan.

### Metis Review (gaps addressed)
- Tambahkan guardrail untuk overlap same-length via `priority` eksplisit agar tidak bergantung urutan acak.
- Definisikan status klasifikasi eksplisit: `RESOLVED`, `AMBIGUOUS`, `UNMATCHED`, `INVALID_INPUT`.
- Pertahankan kontrak output legacy (`no_kjp`, `no_ktp`, `no_kk`, `jenis_kartu`) dan hanya tambah field opsional.
- Hindari interaksi manual untuk klasifikasi; semua keputusan harus non-interaktif dan deterministik.

## Work Objectives
### Core Objective
Mencapai klasifikasi jenis kartu yang akurat, audit-able, dan deterministik untuk nomor KJP pada alur harian, tanpa mengubah perilaku bisnis inti bahwa data ambigu/tidak dikenal harus memblokir output JSON.

### Deliverables
- Spesifikasi schema `card_prefix_rules.json` + dokumen governance update rule.
- Resolver klasifikasi berbasis rule eksternal.
- Integrasi status klasifikasi ke pipeline existing.
- Logging/audit yang memudahkan investigasi salah klasifikasi.
- Paket verifikasi (unit-like scenarios + backtest fixture) yang bisa dijalankan agent.

### Definition of Done (verifiable conditions with commands)
- `python "D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py" --validate-rules-only` exit code `0` untuk rule valid.
- `python "D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py" --dry-run --input "D:\BOT\PERSIAPAN HARIAN KJP\data_mentah_dari_whatsapp.txt"` menghasilkan ringkasan status (`RESOLVED/AMBIGUOUS/UNMATCHED`).
- `python "D:\BOT\PERSIAPAN HARIAN KJP\scripts\backtest_prefix_classifier.py" --rules "D:\BOT\PERSIAPAN HARIAN KJP\card_prefix_rules.json" --baseline "D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv"` menghasilkan report JSON diff.
- `python -m pytest -q D:\BOT\PERSIAPAN HARIAN KJP\tests\test_prefix_classifier.py` lulus penuh.

### Must Have
- Rule prefix dipisah dari kode.
- Longest-prefix matching deterministik.
- Same-length overlap diselesaikan lewat `priority`; jika tetap tie => `AMBIGUOUS`.
- Strict blocking tetap aktif untuk `AMBIGUOUS/UNMATCHED`.
- Output legacy tetap kompatibel.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Tidak boleh mengubah alur validasi KTP/KK/NIK selain kebutuhan integrasi status kartu.
- Tidak boleh menambah prompt manual baru saat klasifikasi kartu.
- Tidak boleh menonaktifkan hard-stop unknown/ambiguous demi "biar lanjut".
- Tidak boleh mengandalkan urutan dictionary/list tanpa rule `priority` eksplisit.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: **tests-after** dengan tambahan test otomatis minimal (pytest) karena repo belum punya test infra formal.
- QA policy: setiap task implementasi wajib berisi skenario happy-path + failure-path yang bisa dieksekusi.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Shared dependencies dipisah di Wave 1 untuk memaksimalkan paralelisme.

Wave 1: definisi kontrak rule, fixture baseline, dan validator fondasi.
Wave 2: resolver engine + integrasi pipeline + logging/audit.
Wave 3: backtest, regression contract, dan rollout guard.

### Dependency Matrix (full, all tasks)
- Task 1 -> Task 2,3,4
- Task 2 -> Task 4,5
- Task 3 -> Task 6,7
- Task 4 -> Task 5,6
- Task 5 -> Task 7,8
- Task 6 -> Task 8

### Agent Dispatch Summary (wave -> task count -> categories)
- Wave 1 -> 3 tasks -> `implementation`, `testing`
- Wave 2 -> 3 tasks -> `implementation`, `review`
- Wave 3 -> 2 tasks -> `testing`, `review`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Definisikan Schema Rule Prefix JSON + Governance

  **What to do**: Buat spesifikasi `card_prefix_rules.json` yang memuat `rule_id`, `card_type`, `prefix`, `priority`, `status`, `source`, `updated_at`, `notes`, dan `ruleset_version`. Tetapkan aturan validasi: prefix numerik, panjang minimal/maksimal, `priority` integer, `rule_id` unik, dan tidak boleh ada entri disabled ikut dipakai resolver.
  **Must NOT do**: Jangan langsung mengubah flow klasifikasi; task ini hanya kontrak data + aturan governance.

  **Recommended Agent Profile**:
  - Category: `implementation` - Reason: butuh desain kontrak teknis yang akan dipakai task berikutnya.
  - Skills: `[]` - tidak butuh skill khusus.
  - Omitted: `git-master` - belum ada aktivitas git lanjutan yang kompleks.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2,3,4 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:57` - map prefix lama hardcoded.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:341` - `detect_jenis_kartu` existing.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:1351` - pola load config JSON yang sudah ada.
  - External: `https://json-schema.org/` - referensi validasi schema.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Ada file rule JSON + schema validasi yang lulus command `python scripts/validate_card_rules.py "D:\BOT\PERSIAPAN HARIAN KJP\card_prefix_rules.json"`.
  - [ ] Minimal 1 contoh overlap + 1 contoh multi-prefix per `card_type` terdokumentasi pada fixture.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Rule file valid (happy path)
    Tool: Bash
    Steps: Jalankan `python scripts/validate_card_rules.py "D:\BOT\PERSIAPAN HARIAN KJP\card_prefix_rules.json"`
    Expected: Exit code 0, output memuat "Schema valid"
    Evidence: .sisyphus/evidence/task-1-schema-valid.txt

  Scenario: Rule file invalid (failure)
    Tool: Bash
    Steps: Jalankan validator ke fixture rusak (missing `priority`)
    Expected: Exit non-zero, output memuat field yang invalid
    Evidence: .sisyphus/evidence/task-1-schema-invalid.txt
  ```

  **Commit**: YES | Message: `feat(prefix-rules): define external json schema and governance` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\card_prefix_rules.json`, `D:\BOT\PERSIAPAN HARIAN KJP\scripts\validate_card_rules.py`, `D:\BOT\PERSIAPAN HARIAN KJP\docs\card-prefix-governance.md`

- [ ] 2. Bangun Resolver Deterministik (Longest Prefix + Priority)

  **What to do**: Implement resolver baru yang menerima nomor kartu dan rule JSON, lalu mengembalikan keputusan `RESOLVED/AMBIGUOUS/UNMATCHED/INVALID_INPUT` plus metadata (`matched_prefix`, `matched_rule_id`, `match_length`, `decision_reason`). Urutan keputusan: longest-prefix match -> priority tertinggi -> jika tie sama persis => `AMBIGUOUS`.
  **Must NOT do**: Jangan fallback ke urutan list/dict implicit; keputusan harus eksplisit dan repeatable.

  **Recommended Agent Profile**:
  - Category: `implementation` - Reason: task inti logic algorithm.
  - Skills: `[]` - logic murni dalam Python existing.
  - Omitted: `playwright` - tidak ada kebutuhan browser.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 4,5 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - API/Type: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:341` - signature deteksi lama.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:925` - existing unknown-prefix handling.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:943` - existing abort flow.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Resolver mengembalikan hasil identik untuk input yang sama pada 20x run berulang (`deterministic`).
  - [ ] Kasus overlap same-length menghasilkan `AMBIGUOUS` jika priority sama.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Longest-prefix selection (happy path)
    Tool: Bash
    Steps: Jalankan `python -m pytest -q D:\BOT\PERSIAPAN HARIAN KJP\tests\test_prefix_classifier.py::test_longest_prefix_wins`
    Expected: Test pass dan `matched_prefix` adalah prefix terpanjang
    Evidence: .sisyphus/evidence/task-2-longest-prefix.txt

  Scenario: Equal-length tie unresolved (failure/edge)
    Tool: Bash
    Steps: Jalankan `python -m pytest -q D:\BOT\PERSIAPAN HARIAN KJP\tests\test_prefix_classifier.py::test_equal_priority_tie_is_ambiguous`
    Expected: Status `AMBIGUOUS`, tidak ada `jenis_kartu` final
    Evidence: .sisyphus/evidence/task-2-ambiguous-tie.txt
  ```

  **Commit**: YES | Message: `feat(classifier): add deterministic longest-prefix resolver` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py`, `D:\BOT\PERSIAPAN HARIAN KJP\tests\test_prefix_classifier.py`

- [ ] 3. Siapkan Fixture Uji dan Baseline Historis

  **What to do**: Buat dataset fixture representatif (normal, overlap, unknown, invalid) yang meniru format input real dari `data_mentah_dari_whatsapp.txt` dan baseline mapping dari `data_no_kjp.csv`. Sertakan expected output classification per kasus.
  **Must NOT do**: Jangan pakai data sensitif mentah tanpa masking; fixture wajib aman untuk versioning internal.

  **Recommended Agent Profile**:
  - Category: `testing` - Reason: fokus data quality dan representasi kasus.
  - Skills: `[]` - tidak butuh integrasi eksternal.
  - Omitted: `security-auditor` - cukup masking standar internal.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6,7 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\data_mentah_dari_whatsapp.txt` - bentuk input lapangan.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv` - sumber baseline nomor.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\log_no_baru_selain_kjp_lansia_dll.txt` - contoh unknown-prefix log.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Fixture memiliki minimal 20 kasus lintas kategori (`RESOLVED`, `AMBIGUOUS`, `UNMATCHED`, `INVALID_INPUT`).
  - [ ] Tiap kasus punya expected classification yang dapat diassert otomatis.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Fixture completeness (happy path)
    Tool: Bash
    Steps: Jalankan `python scripts/check_fixture_coverage.py D:\BOT\PERSIAPAN HARIAN KJP\tests\fixtures\prefix_cases.json`
    Expected: Exit code 0 dan laporan jumlah kasus per status >= threshold
    Evidence: .sisyphus/evidence/task-3-fixture-coverage.txt

  Scenario: Fixture invalid shape (failure)
    Tool: Bash
    Steps: Jalankan checker pada fixture tanpa field `expected_status`
    Expected: Exit non-zero dengan pesan field wajib hilang
    Evidence: .sisyphus/evidence/task-3-fixture-invalid.txt
  ```

  **Commit**: YES | Message: `test(prefix): add representative fixtures and expected outcomes` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\tests\fixtures\prefix_cases.json`, `D:\BOT\PERSIAPAN HARIAN KJP\scripts\check_fixture_coverage.py`

- [ ] 4. Integrasikan Resolver Baru ke Pipeline Existing

  **What to do**: Ganti pemakaian `detect_jenis_kartu` lama agar memanggil resolver baru berbasis JSON. Mapping hasil resolver ke field existing (`jenis_kartu`, `prefix`) harus kompatibel untuk status `RESOLVED`.
  **Must NOT do**: Jangan ubah alur `tambah/hapus` JSON per lokasi, dan jangan sentuh validasi KTP/KK di luar kebutuhan integrasi.

  **Recommended Agent Profile**:
  - Category: `implementation` - Reason: menyentuh alur utama script produksi.
  - Skills: `[]` - codebase lokal Python tunggal.
  - Omitted: `refactorer` - targetnya integrasi minimal, bukan refactor luas.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 5,6 | Blocked By: 1,2

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:917` - titik konsumsi `jenis_kartu` sebelum output.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:925` - warning unknown existing.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:943` - hard-stop behavior existing.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Untuk kasus `RESOLVED`, output JSON per lokasi tetap punya key legacy tanpa perubahan nama.
  - [ ] Tidak ada regresi pada mode pemrosesan (`tambah/hapus`) untuk data valid.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Pipeline resolved data works (happy path)
    Tool: Bash
    Steps: Jalankan `python "D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py" --dry-run --fixture "D:\BOT\PERSIAPAN HARIAN KJP\tests\fixtures\prefix_resolved_only.txt"`
    Expected: Ringkasan menampilkan semua `RESOLVED`, tidak ada abort
    Evidence: .sisyphus/evidence/task-4-resolved-flow.txt

  Scenario: Pipeline with unresolved status blocks (failure/edge)
    Tool: Bash
    Steps: Jalankan dry-run dengan fixture berisi `AMBIGUOUS`/`UNMATCHED`
    Expected: Proses stop deterministik sebelum write JSON, log menyebut alasan
    Evidence: .sisyphus/evidence/task-4-block-on-unresolved.txt
  ```

  **Commit**: YES | Message: `feat(pipeline): integrate external prefix resolver into classification flow` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py`

- [ ] 5. Terapkan Strict Blocking Policy Berbasis Status

  **What to do**: Implement aturan final: `AMBIGUOUS` dan `UNMATCHED` selalu blokir output JSON, `INVALID_INPUT` diperlakukan sebagai blokir + reason khusus, `RESOLVED` lanjut normal. Pastikan pesan error actionable (menyebut no_kjp, nama, matched candidates).
  **Must NOT do**: Jangan diam-diam menurunkan error jadi warning; policy strict harus konsisten.

  **Recommended Agent Profile**:
  - Category: `review` - Reason: fokus safety behavior dan consistency policy.
  - Skills: `[]` - berbasis flow existing.
  - Omitted: `quick` - dampak operasional butuh kehati-hatian.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7,8 | Blocked By: 2,4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:925` - format warning prefix lama.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:943` - pola abort existing.
  - Test: `D:\BOT\PERSIAPAN HARIAN KJP\2_CEK_DATA_ULTIMATE_AUTO.py` - checker pendamping untuk validasi hasil.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Semua status non-`RESOLVED` menyebabkan path write JSON tidak dieksekusi.
  - [ ] Pesan log memuat status, nomor kartu, dan alasan klasifikasi.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Strict block on ambiguous/unmatched (happy policy path)
    Tool: Bash
    Steps: Jalankan `python -m pytest -q D:\BOT\PERSIAPAN HARIAN KJP\tests\test_blocking_behavior.py::test_abort_on_ambiguous_unmatched`
    Expected: Test pass, writer mock tidak terpanggil
    Evidence: .sisyphus/evidence/task-5-strict-block.txt

  Scenario: Unexpected write attempted (failure)
    Tool: Bash
    Steps: Jalankan test guard yang memaksa writer dipanggil saat `AMBIGUOUS`
    Expected: Test gagal dengan assertion policy violation
    Evidence: .sisyphus/evidence/task-5-policy-violation.txt
  ```

  **Commit**: YES | Message: `fix(policy): enforce strict blocking for unresolved classifications` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py`, `D:\BOT\PERSIAPAN HARIAN KJP\tests\test_blocking_behavior.py`

- [ ] 6. Tambahkan Audit Trail dan Laporan Konflik Klasifikasi

  **What to do**: Simpan audit artifact terstruktur (JSON/CSV) untuk setiap kasus non-`RESOLVED` berisi `rule_id candidates`, `matched_prefix candidates`, `decision_reason`, timestamp, dan input source. Audit harus mudah difilter untuk update rule berikutnya.
  **Must NOT do**: Jangan hanya log teks bebas; wajib ada format machine-readable.

  **Recommended Agent Profile**:
  - Category: `implementation` - Reason: perlu desain output observability.
  - Skills: `[]` - fokus serialisasi/logging lokal.
  - Omitted: `security` - tidak ada perubahan auth/crypto.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 3,4

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\log_no_baru_selain_kjp_lansia_dll.txt` - pola log existing yang perlu ditingkatkan.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\log_error_validasi.txt` - referensi error log historis.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Untuk setiap run yang punya unresolved case, artifact audit terbuat otomatis dengan struktur field konsisten.
  - [ ] Minimal ada aggregate summary count per status (`AMBIGUOUS`, `UNMATCHED`, `INVALID_INPUT`).

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Audit artifact generated (happy path)
    Tool: Bash
    Steps: Jalankan dry-run fixture campuran lalu validasi schema audit `python scripts/validate_audit_report.py <audit_file>`
    Expected: Exit 0, semua field wajib tersedia
    Evidence: .sisyphus/evidence/task-6-audit-valid.txt

  Scenario: Corrupted audit payload (failure)
    Tool: Bash
    Steps: Jalankan validator ke audit file yang sengaja dihapus field `decision_reason`
    Expected: Exit non-zero, error field missing
    Evidence: .sisyphus/evidence/task-6-audit-invalid.txt
  ```

  **Commit**: YES | Message: `feat(observability): add structured classification audit logs` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\reports\`, `D:\BOT\PERSIAPAN HARIAN KJP\scripts\validate_audit_report.py`, `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py`

- [ ] 7. Bangun Backtest/Diff Report terhadap Data Historis

  **What to do**: Buat skrip backtest yang membandingkan hasil classifier baru vs baseline historis, lalu menghasilkan ringkasan: `unchanged`, `changed`, `ambiguous`, `unmatched`, plus daftar sampel mismatch prioritas tinggi untuk investigasi.
  **Must NOT do**: Jangan overwrite data produksi; output backtest harus masuk file report terpisah.

  **Recommended Agent Profile**:
  - Category: `testing` - Reason: fokus evaluasi dampak dan metrik kualitas.
  - Skills: `[]` - cukup scripting lokal.
  - Omitted: `executor` - tidak perlu orkestrasi panjang.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 8 | Blocked By: 3,5

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv` - baseline mapping historis.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\kjp_kapuk.json` - contoh output lokasi existing.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\kjp_durikosambi.json` - contoh output lokasi existing.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Backtest report selalu memuat metrik total dan persentase perubahan.
  - [ ] Report menampilkan top-20 mismatch dengan context cukup untuk triage rule.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Backtest report generated (happy path)
    Tool: Bash
    Steps: Jalankan `python D:\BOT\PERSIAPAN HARIAN KJP\scripts\backtest_prefix_classifier.py --rules D:\BOT\PERSIAPAN HARIAN KJP\card_prefix_rules.json --baseline D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv --out D:\BOT\PERSIAPAN HARIAN KJP\reports\classifier_diff.json`
    Expected: File report terbentuk dan berisi seluruh metrik wajib
    Evidence: .sisyphus/evidence/task-7-backtest-report.txt

  Scenario: Missing baseline input (failure)
    Tool: Bash
    Steps: Jalankan backtest dengan path baseline tidak valid
    Expected: Exit non-zero dan pesan error input file not found
    Evidence: .sisyphus/evidence/task-7-backtest-missing-input.txt
  ```

  **Commit**: YES | Message: `test(backtest): add classifier diff reporting against historical data` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\scripts\backtest_prefix_classifier.py`, `D:\BOT\PERSIAPAN HARIAN KJP\reports\`

- [ ] 8. Hardening Rollout + Regression Contract Gate

  **What to do**: Tambahkan gate akhir sebelum release: (1) contract test output legacy, (2) deterministic test rerun, (3) strict-block behavior test, (4) backtest threshold check. Tetapkan threshold default: perubahan label <= 5% atau wajib review manual rule pack sebelum deploy.
  **Must NOT do**: Jangan release ketika ada test gagal atau threshold terlampaui tanpa approval review.

  **Recommended Agent Profile**:
  - Category: `review` - Reason: gate kualitas lintas seluruh deliverable.
  - Skills: `[]` - fokus verifikasi dan guardrail.
  - Omitted: `quick` - task ini quality gate final.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: none | Blocked By: 5,6,7

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:341` - fungsi deteksi existing sebagai baseline integrasi.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py:917` - kontrak field output existing.
  - Pattern: `D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv` - baseline historis untuk threshold diff gate.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Satu command gate menjalankan seluruh suite dan exit 0 jika lolos semua.
  - [ ] Jika diff > threshold, gate exit non-zero dengan pesan "needs rules review".

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Full gate pass (happy path)
    Tool: Bash
    Steps: Jalankan `python D:\BOT\PERSIAPAN HARIAN KJP\scripts\run_prefix_release_gate.py --threshold 0.05`
    Expected: Exit 0, output memuat PASS untuk contract, policy, deterministic, backtest
    Evidence: .sisyphus/evidence/task-8-release-gate-pass.txt

  Scenario: Diff threshold exceeded (failure)
    Tool: Bash
    Steps: Jalankan gate dengan fixture yang memicu perubahan >5%
    Expected: Exit non-zero dengan reason `needs rules review`
    Evidence: .sisyphus/evidence/task-8-release-gate-fail.txt
  ```

  **Commit**: YES | Message: `chore(quality-gate): add rollout gate for prefix classifier migration` | Files: `D:\BOT\PERSIAPAN HARIAN KJP\scripts\run_prefix_release_gate.py`, `D:\BOT\PERSIAPAN HARIAN KJP\tests\`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit - oracle
- [ ] F2. Code Quality Review - unspecified-high
- [ ] F3. Real Manual QA - unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check - deep

## Commit Strategy
- Commit per task bernilai bisnis (rule schema, resolver, integration, verification).
- Format: `type(scope): desc`.
- Hindari commit campur (jangan gabung refactor non-prefix ke commit ini).

## Success Criteria
- Salah klasifikasi prefix overlap berkurang dan terukur via backtest report.
- Tidak ada perubahan kontrak output legacy untuk kasus `RESOLVED`.
- Pipeline berhenti deterministik ketika `AMBIGUOUS/UNMATCHED` dengan log yang actionable.
- Rule update berikutnya bisa dilakukan tanpa edit kode inti.
