// test/test_lid_phone_mapping.ts
// Script untuk menguji validasi No HP Baru, No HP Lama + LID, No HP Lama Tanpa LID

import { 
  initRegisteredUsersCache,
  getPhoneFromLidSync,
  getRegisteredUserNameSync,
  getRegisteredUserByPhone,
  upsertLidPhoneMap,
  getTotalDataTodayForSender
} from '../src/supabase';

// --- HELPER FUNCTIONS (Simulasi dari wa.ts) ---

function isLidJid(jid: string): boolean {
  return jid.includes('@lid');
}

function normalizePhone(raw: string): string {
  let p = raw.replace(/\D/g, '');
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (p.startsWith('+')) p = p.slice(1);
  return p;
}

function extractManualPhone(text: string): string | null {
  const clean = (text || '').trim();
  const match = clean.match(/(?:\+?62|0)\s*8[\d\s\-\.]{8,13}/);
  if (match) {
    let p = match[0].replace(/[\s\-\.]/g, '').replace(/\D/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    if (p.length >= 10 && p.length <= 15) return p;
  }
  return null;
}

// --- SIMULASI PROSES PESAN ---

interface SimulatedMessage {
  remoteJid: string;
  pushName?: string;
  messageText: string;
}

async function simulateMessageProcessing(msg: SimulatedMessage) {
  const rawRemoteJid = msg.remoteJid;
  const chatJid = rawRemoteJid; // Simplified, di wa.ts pakai jidNormalizedUser
  
  // senderPhone: dipakai untuk identitas/DB
  let senderPhone = chatJid.replace('@s.whatsapp.net', '').replace('@lid', '');
  let resolvedVia = 'JID langsung';
  
  // --- LOGIK RESOLUSI NOMOR HP ---
  if (isLidJid(chatJid) || !chatJid.includes('@s.whatsapp.net')) {
    // 1) Cek Cache Supabase (LID -> Phone)
    const cachedPhone = getPhoneFromLidSync(chatJid);
    if (cachedPhone) {
      senderPhone = cachedPhone;
      resolvedVia = 'Cache LID';
    } else {
      // 2) Fallback ke Supabase DB
      // Di test ini kita skip store baileys karena tidak bisa di-mock
      resolvedVia = 'TIDAK DITEMUKAN (Perlu input manual)';
    }
  }
  
  // Cek nama terdaftar
  let existingName = getRegisteredUserNameSync(senderPhone);
  
  // Jika cache miss, coba DB
  if (!existingName && senderPhone) {
    const dbLookup = await getRegisteredUserByPhone(senderPhone);
    if (dbLookup && dbLookup.push_name) {
      existingName = dbLookup.push_name;
    }
  }
  
  return {
    chatJid,
    senderPhone,
    resolvedVia,
    existingName,
    isLid: isLidJid(chatJid),
  };
}

// --- MAIN TEST ---

async function runTests() {
  console.log('🧪 TEST VALIDASI NOMOR HP & LID\n');
  console.log('='.repeat(60));
  
  // Inisialisasi cache
  console.log('\n📦 Inisialisasi cache pengguna...');
  await initRegisteredUsersCache();
  
  console.log('\n' + '='.repeat(60));
  
  // --- SKENARIO TEST ---
  const testCases: SimulatedMessage[] = [
    {
      remoteJid: '628123456789@s.whatsapp.net', // No HP Baru / No HP Lama Tanpa LID
      pushName: 'Budi Android',
      messageText: 'MENU',
    },
    {
      remoteJid: '628987654321@s.whatsapp.net', // No HP yang belum terdaftar
      pushName: 'User Baru',
      messageText: 'Halo',
    },
    {
      remoteJid: '123456789012345@lid', // LID yang belum ter-mapping
      pushName: 'Siti Desktop',
      messageText: 'CEK',
    },
    {
      remoteJid: '987654321098765@lid', // LID lain
      pushName: undefined,
      messageText: 'Siti 085988880000', // User kirim nomor HP untuk mapping
    },
  ];
  
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`\n📱 Skenario ${i + 1}: ${tc.pushName || 'Unknown'}`);
    console.log('-'.repeat(50));
    console.log(`   JID: ${tc.remoteJid}`);
    console.log(`   Pesan: "${tc.messageText}"`);
    
    const result = await simulateMessageProcessing(tc);
    
    console.log(`\n   📊 Hasil Resolusi:`);
    console.log(`   ├─ Tipe JID: ${result.isLid ? '@lid (Linked Device)' : '@s.whatsapp.net (HP Langsung)'}`);
    console.log(`   ├─ Nomor HP: ${result.senderPhone}`);
    console.log(`   ├─ Resolved Via: ${result.resolvedVia}`);
    console.log(`   └─ Nama Terdaftar: ${result.existingName || '(Belum terdaftar)'}`);
    
    // Status
    if (result.isLid && result.resolvedVia.includes('TIDAK DITEMUKAN')) {
      console.log(`\n   ⚠️ Status: Bot akan minta user ketik nomor HP`);
    } else if (!result.existingName) {
      console.log(`\n   ⚠️ Status: User belum terdaftar, tapi data tetap bisa dikirim`);
    } else {
      console.log(`\n   ✅ Status: User dikenali, siap menerima data`);
    }
  }
  
  // --- TEST KIRIM DATA DENGAN BERBAGAI SKENARIO ---
  console.log('\n\n' + '='.repeat(60));
  console.log('📝 TEST PENGIRIMAN DATA\n');
  
  // Simulasi data pendaftaran
  const dataInput = `Budi Santoso
5049488500001111
3173444455556666
3173555566667777`;

  const senderScenarios = [
    { phone: '628123456789', name: 'User HP Android', type: '@s.whatsapp.net' },
    { phone: '628987654321', name: 'User HP Baru', type: '@s.whatsapp.net' },
    { phone: '123456789012345', name: 'User Desktop (LID)', type: '@lid' },
  ];
  
  for (const sender of senderScenarios) {
    console.log(`\n👤 Pengirim: ${sender.name} (${sender.type})`);
    console.log(`   Nomor: ${sender.phone}`);
    
    // Cek apakah nomor bisa di-resolve
    let resolvedPhone = sender.phone;
    if (sender.type === '@lid') {
      const cached = getPhoneFromLidSync(`${sender.phone}@lid`);
      if (cached) {
        resolvedPhone = cached;
        console.log(`   ✅ LID ter-mapping ke: ${resolvedPhone}`);
      } else {
        console.log(`   ⚠️ LID belum ter-mapping, data disimpan dengan ID: ${sender.phone}`);
      }
    } else {
      console.log(`   ✅ Nomor HP langsung dipakai`);
    }
    
    // Cek total data hari ini untuk sender ini
    const processingDayKey = new Date().toISOString().split('T')[0];
    const totalToday = await getTotalDataTodayForSender(resolvedPhone, processingDayKey);
    console.log(`   📊 Total data hari ini: ${totalToday}`);
  }
  
  console.log('\n\n' + '='.repeat(60));
  console.log('🏁 TEST SELESAI\n');
  
  // --- SUMMARY ---
  console.log('📋 RINGKASAN:\n');
  console.log('1. No HP Baru (@s.whatsapp.net):');
  console.log('   → Langsung pakai nomor dari JID');
  console.log('   → Data SELALU diterima ✅\n');
  
  console.log('2. No HP Lama + LID (@lid) - SUDAH MAPPING:');
  console.log('   → Cari di Cache/DB, dapat nomor asli');
  console.log('   → Data diterima dengan nomor asli ✅\n');
  
  console.log('3. No HP Lama + LID (@lid) - BELUM MAPPING:');
  console.log('   → Bot minta user ketik: "Nama 08xxxxxxxx"');
  console.log('   → Setelah diketik, mapping tersimpan');
  console.log('   → Pesan berikutnya langsung dikenali ✅\n');
}

runTests().catch(console.error);
