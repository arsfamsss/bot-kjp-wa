// test/test_all_features.ts
// Script untuk menguji semua fitur parsing dan validasi

import { processRawMessageToLogJson, parseRawMessageToLines, validateBlockToItem, groupLinesToBlocks } from '../src/parser';
import { buildReplyForNewData } from '../src/reply';

// Mock data untuk testing
const TEST_CASES = [
  {
    name: '✅ Test 1: Data Valid Tunggal',
    input: `Budi Santoso
5049488500001111
3173444455556666
3173555566667777`,
    expectedOk: 1,
    expectedFail: 0,
  },
  {
    name: '✅ Test 2: Data Valid Multiple (2 orang)',
    input: `Budi Santoso
5049488500001111
3173444455556666
3173555566667777

Siti Aminah
5049488500002222
3173111122223333
3173222233334444`,
    expectedOk: 2,
    expectedFail: 0,
  },
  {
    name: '❌ Test 3: No KTP sama dengan No Kartu (ERROR baru)',
    input: `Azzalea Shena Nazira
3173014809200003
3173014809200003
3173010606160027`,
    expectedOk: 0,
    expectedFail: 1,
    expectedErrorType: 'same_as_other',
  },
  {
    name: '❌ Test 4: No KK sama dengan No KTP',
    input: `Test User
5049488500001111
3173444455556666
3173444455556666`,
    expectedOk: 0,
    expectedFail: 1,
    expectedErrorType: 'same_as_other',
  },
  {
    name: '❌ Test 5: No Kartu kurang digit',
    input: `Test User
504948850000
3173444455556666
3173555566667777`,
    expectedOk: 0,
    expectedFail: 1,
    expectedErrorType: 'invalid_length',
  },
  {
    name: '❌ Test 6: No KTP kurang digit',
    input: `Test User
5049488500001111
31734444555
3173555566667777`,
    expectedOk: 0,
    expectedFail: 1,
    expectedErrorType: 'invalid_length',
  },
  {
    name: '⚠️ Test 7: Data Tidak Lengkap (3 baris)',
    input: `Test User
5049488500001111
3173444455556666`,
    expectedOk: 0,
    expectedFail: 0,
    expectedRemainder: true,
  },
  {
    name: '⚠️ Test 8: Partial Success (1 OK, 1 Error)',
    input: `Budi Valid
5049488500001111
3173444455556666
3173555566667777

Siti Error
5049488500002222
5049488500002222
3173222233334444`,
    expectedOk: 1,
    expectedFail: 1,
  },
  {
    name: '✅ Test 9: Nama dengan Spasi dan Angka Nempel',
    input: `Agus Dalimin 5049488500001111
3173444455556666
3173555566667777`,
    expectedOk: 0, // Hanya 3 baris setelah split? Tidak, akan auto-split
    expectedFail: 0,
    // Ini harusnya auto-split jadi 4 baris
  },
  {
    name: '✅ Test 10: Label KTP/NIK di depan angka',
    input: `Budi Santoso
No Kartu 5049488500001111
NIK 3173444455556666
No KK 3173555566667777`,
    expectedOk: 1,
    expectedFail: 0,
  },
];

console.log('🧪 MULAI PENGUJIAN FITUR BOT\n');
console.log('='.repeat(60));

// Test Parsing
for (const testCase of TEST_CASES) {
  console.log(`\n${testCase.name}`);
  console.log('-'.repeat(50));
  
  const lines = parseRawMessageToLines(testCase.input);
  console.log(`📝 Baris terdeteksi: ${lines.length}`);
  
  const { blocks, remainder } = groupLinesToBlocks(lines);
  console.log(`📦 Blok data: ${blocks.length}`);
  console.log(`📋 Sisa baris: ${remainder.length}`);
  
  if (blocks.length > 0) {
    const items = blocks.map((block, i) => validateBlockToItem(block, i + 1));
    const okCount = items.filter(it => it.status === 'OK').length;
    const failCount = items.filter(it => it.status !== 'OK').length;
    
    console.log(`✅ OK: ${okCount}`);
    console.log(`❌ Gagal: ${failCount}`);
    
    // Tampilkan error jika ada
    items.forEach(item => {
      if (item.status !== 'OK') {
        console.log(`   └─ ${item.parsed.nama || 'N/A'}: ${item.errors.map(e => e.type + ' - ' + e.detail).join(', ')}`);
      }
    });
    
    // Verifikasi
    if (testCase.expectedOk !== undefined) {
      const okMatch = okCount === testCase.expectedOk;
      const failMatch = failCount === testCase.expectedFail;
      console.log(`\n   📊 Hasil: ${okMatch && failMatch ? '✅ PASS' : '❌ FAIL'}`);
      if (!okMatch) console.log(`      Expected OK: ${testCase.expectedOk}, Got: ${okCount}`);
      if (!failMatch) console.log(`      Expected Fail: ${testCase.expectedFail}, Got: ${failCount}`);
    }
  } else if (remainder.length > 0) {
    console.log(`⚠️ Tidak ada blok valid, ada ${remainder.length} baris sisa`);
    if (testCase.expectedRemainder) {
      console.log(`\n   📊 Hasil: ✅ PASS (Expected remainder)`);
    }
  }
}

// Test Reply Builder
console.log('\n' + '='.repeat(60));
console.log('\n🔧 TEST REPLY BUILDER\n');

// Simulasi LogJson untuk test reply
const mockLogSuccess = {
  message_id: 'test123',
  sender_phone: '628123456789',
  received_at: new Date().toISOString(),
  tanggal: '2026-01-19',
  processing_day_key: '2026-01-19',
  stats: {
    total_blocks: 2,
    ok_count: 2,
    skip_format_count: 0,
    skip_duplicate_count: 0,
  },
  items: [
    {
      index: 1,
      raw_lines: ['Budi', '5049488500001111', '3173444455556666', '3173555566667777'],
      parsed: { nama: 'BUDI', no_kjp: '5049488500001111', no_ktp: '3173444455556666', no_kk: '3173555566667777' },
      status: 'OK' as const,
      errors: [],
      duplicate_info: null,
    },
    {
      index: 2,
      raw_lines: ['Siti', '5049488500002222', '3173111122223333', '3173222233334444'],
      parsed: { nama: 'SITI', no_kjp: '5049488500002222', no_ktp: '3173111122223333', no_kk: '3173222233334444' },
      status: 'OK' as const,
      errors: [],
      duplicate_info: null,
    },
  ],
};

console.log('📨 Pesan Sukses (2 data, total 5 hari ini):');
console.log('-'.repeat(50));
console.log(buildReplyForNewData(mockLogSuccess, 5));

// Test dengan error same_as_other
const mockLogError = {
  message_id: 'test456',
  sender_phone: '628123456789',
  received_at: new Date().toISOString(),
  tanggal: '2026-01-19',
  processing_day_key: '2026-01-19',
  stats: {
    total_blocks: 1,
    ok_count: 0,
    skip_format_count: 1,
    skip_duplicate_count: 0,
  },
  items: [
    {
      index: 1,
      raw_lines: ['Azzalea', '3173014809200003', '3173014809200003', '3173010606160027'],
      parsed: { nama: 'AZZALEA', no_kjp: '3173014809200003', no_ktp: '3173014809200003', no_kk: '3173010606160027' },
      status: 'SKIP_FORMAT' as const,
      errors: [
        { field: 'no_ktp' as const, type: 'same_as_other' as const, detail: 'No KTP sama dengan No Kartu. Setiap nomor harus berbeda.' }
      ],
      duplicate_info: null,
    },
  ],
};

console.log('\n\n📨 Pesan Error (No KTP = No Kartu):');
console.log('-'.repeat(50));
console.log(buildReplyForNewData(mockLogError, 3));

// Test dengan duplikat database
const mockLogDuplicate = {
  message_id: 'test789',
  sender_phone: '628123456789',
  received_at: new Date().toISOString(),
  tanggal: '2026-01-19',
  processing_day_key: '2026-01-19',
  stats: {
    total_blocks: 1,
    ok_count: 0,
    skip_format_count: 0,
    skip_duplicate_count: 1,
  },
  items: [
    {
      index: 1,
      raw_lines: ['Budi', '5049488500001111', '3173444455556666', '3173555566667777'],
      parsed: { nama: 'BUDI', no_kjp: '5049488500001111', no_ktp: '3173444455556666', no_kk: '3173555566667777' },
      status: 'SKIP_DUPLICATE' as const,
      errors: [],
      duplicate_info: {
        kind: 'NO_KTP' as const,
        processing_day_key: '2026-01-19',
        safe_message: 'No KTP sudah digunakan hari ini.',
        first_seen_at: null,
        first_seen_wib_time: null,
        original_data: {
          nama: 'ANDINI',
          no_kjp: '5049488500001666',
          no_ktp: '3173444455556666',
          no_kk: '3173555566667444',
        },
      },
    },
  ],
};

console.log('\n\n📨 Pesan Duplikat (dengan data asli):');
console.log('-'.repeat(50));
console.log(buildReplyForNewData(mockLogDuplicate, 3));

console.log('\n\n' + '='.repeat(60));
console.log('🏁 PENGUJIAN SELESAI');
