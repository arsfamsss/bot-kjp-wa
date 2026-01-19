// src/wa.ts

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    WASocket,
    jidNormalizedUser,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import { makeInMemoryStore } from './store';

// --- IMPORT LOGIC DARI FILE LAIN ---
import { processRawMessageToLogJson, parseRawMessageToLines } from './parser';
import {
    getTodayRecapForSender,
    buildReplyForTodayRecap,
    getGlobalRecap,
    buildReplyForInvalidDetails,
    generateExportData,
} from './recap';
import { buildReplyForNewData } from './reply';
import {
    saveLogAndOkItems,
    supabase,
    deleteDataByNameOrCard,
    clearDatabaseForProcessingDayKey,
    getPhoneByLidJid,
    upsertLidPhoneMap,
    getNameFromLidPhoneMap,
    deleteLidPhoneMap,
    getAllLidPhoneMap,
    initRegisteredUsersCache,
    getRegisteredUserNameSync,
    deleteLastSubmission,
    getStatistics,
    deleteDailyDataByIndex,
    getRegisteredUserByPhone,
    updateLidForPhone,
    getPhoneFromLidSync,
    getTotalDataTodayForSender,
} from './supabase';
import { getProcessingDayKey, getWibIsoDate, shiftIsoDate, isSystemClosed } from './time';
import {
    MENU_MESSAGE,
    FAQ_MESSAGE,
    ADMIN_LAUNCHER_LINE,
    ADMIN_MENU_MESSAGE,
    ADMIN_PHONES_RAW,
} from './config/messages';
import {
    normalizePhone,
    normalizeManualPhone,
    extractManualPhone,
    isLidJid,
} from './utils/contactUtils';
import {
    UserFlowState,
    AdminFlowState,
    BroadcastDraft,
    userFlowByPhone,
    adminFlowByPhone,
    pendingDelete,
    broadcastDraftMap,
    adminContactCache,
} from './state';

const AUTH_FOLDER = 'auth_info_baileys';
const STORE_FILE = 'baileys_store.json';

// --- STORE SETUP (Hubungkan ke file JSON) ---
const store = makeInMemoryStore({
    logger: pino({ level: 'silent' })
});

// Baca file store jika ada
store.readFromFile(STORE_FILE);

// Simpan ke file setiap 10 detik (agar tidak terlalu sering write disk)
setInterval(() => {
    store.writeToFile(STORE_FILE);
}, 10_000);

let sock: WASocket;



// --- UTILS: LID LOOKUP VIA STORE ---
// Cari nomor HP asli dari database kontak Baileys (store)
function getPhoneFromLid(lidJid: string): string | null {
    const contact = store.contacts[lidJid];
    if (contact && contact.id && contact.id !== lidJid) {
        return contact.id; // Ini biasanya nomor HP (misal: 628xxx@s.whatsapp.net)
    }
    return null;
}

const ADMIN_PHONES = new Set(ADMIN_PHONES_RAW.map(normalizePhone));

// --- KIRIM MENU TEKS ---
async function sendMainMenu(sock: WASocket, remoteJid: string, isAdmin: boolean) {
    let finalMenu = MENU_MESSAGE;
    if (isAdmin) finalMenu += `\n\n${ADMIN_LAUNCHER_LINE}`;
    await sock.sendMessage(remoteJid, { text: finalMenu });
    console.log(`✅ Menu teks terkirim ke ${remoteJid} (isAdmin: ${isAdmin})`);
}

function normalizeIncomingCommand(raw: string): string {
    const up = (raw || '').trim().toUpperCase();
    if (up === 'MENU_DAFTAR') return '1';
    if (up === 'MENU_CEK') return '2';
    if (up === 'MENU_HAPUS') return '3';
    return up;
}

function getMessageDate(msg: any): Date {
    const ts: any = msg?.messageTimestamp;
    try {
        if (typeof ts === 'number') return new Date(ts * 1000);
        if (typeof ts === 'string') return new Date(Number(ts) * 1000);
        if (ts && typeof ts.toNumber === 'function') return new Date(ts.toNumber() * 1000);
    } catch {
        // ignore
    }
    return new Date();
}

// --- HELPER FILTER ---
function shouldIgnoreMessage(msg: any): boolean {
    const jid = msg.key?.remoteJid;
    if (!jid) return true;
    if (jid === 'status@broadcast') return true;
    if (jid.endsWith('@newsletter')) {
        console.log(`[IGNORED] newsletter: ${jid}`);
        return true;
    }
    if (jid.endsWith('@broadcast')) {
        console.log('[IGNORED] broadcast system');
        return true;
    }
    if (jid.endsWith('@g.us')) {
        console.log(`[IGNORED] group: ${jid}`);
        return true;
    }
    if (!msg.message) return true;
    return false;
}

export async function connectToWhatsApp() {
    await initRegisteredUsersCache(); // Inisialisasi cache user terdaftar
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`🔗 Menghubungkan ke WA v${version.join('.')}...`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04'], // Ubah browser info agar support pairing code
        generateHighQualityLinkPreview: true,
    });
    
    // --- PAIRING CODE LOGIC ---
    // --- PAIRING CODE LOGIC (DISABLED - USE QR) ---
    /*
    if (!sock.authState.creds.registered) {
       const phoneNumber = '6287776960445'; 
       setTimeout(async () => {
           try {
               const code = await sock.requestPairingCode(phoneNumber);
               console.log(`\n================================`);
               console.log(`PAIRING CODE: ${code}`);
               console.log(`================================\n`);
           } catch (err) {
               console.error('Gagal request pairing code:', err);
           }
       }, 4000);
    }
    */

    // Hubungkan store dengan event socket agar kontak terus terupdate
    store.bind(sock.ev);

    // FIX: Load & Save Store agar LID mapping awet (Persistent Store)
    const STORE_FILE = 'baileys_store_multi.json';
    store.readFromFile(STORE_FILE);
    
    // Save store setiap 10 detik agar data tidak hilang saat restart
    setInterval(() => {
        store.writeToFile(STORE_FILE);
    }, 10_000);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('SCAN QR CODE DI BAWAH INI:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const err = lastDisconnect?.error as Boom;
            const statusCode = err?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Koneksi terputus:', err);
            console.log('👉 Status Code:', statusCode);
            console.log('🔄 Reconnect otomatis?', shouldReconnect);

            if (shouldReconnect) connectToWhatsApp();
            else console.log('⛔ Sesi logout. Hapus folder auth_info_baileys dan scan ulang.');
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Terhubung! Siap menerima pesan.');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // (Code listener manual contacts.upsert/update KITA HAPUS karena sudah di-handle oleh store.bind)

    // --- LOGIC UTAMA PROSES PESAN ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (msg.key.fromMe) continue;
            if (shouldIgnoreMessage(msg)) continue;

            try {
                const rawRemoteJid = msg.key.remoteJid;
                if (!rawRemoteJid) continue;

                // 🔄 IDENTITAS PENGIRIM & JID CHAT
                // chatJid: selalu dipakai untuk balas (biar aman walau incoming @lid)
                const chatJid = jidNormalizedUser(rawRemoteJid);

                // senderPhone: dipakai untuk identitas/DB/admin. Kalau @lid, ambil dari Supabase mapping (manual input).
                let senderPhone = chatJid.replace('@s.whatsapp.net', '').replace('@lid', '');

                if (isLidJid(chatJid) || !chatJid.includes('@s.whatsapp.net')) {
                    // 1) Cek Cache Supabase (LID -> Phone) - FASTEST & MOST ACCURATE
                    const cachedPhone = getPhoneFromLidSync(chatJid);
                    if (cachedPhone) {
                         senderPhone = cachedPhone;
                         // console.log(`⚡ Hit Cache LID: ${chatJid} -> ${senderPhone}`);
                    } else {
                        // 2) Cek Store Baileys (Fallback)
                        const storePhone = getPhoneFromLid(chatJid);
                        if (storePhone) {
                            senderPhone = storePhone.replace('@s.whatsapp.net', '');
                            // Simpan ke Supabase agar persistent
                            upsertLidPhoneMap({ lid_jid: chatJid, phone_number: senderPhone, push_name: null }).catch(() => {});
                        } else {
                            // 3) Fallback ke Supabase Async (siapa tahu cache belum ke-load sempurna)
                            const mapped = await getPhoneByLidJid(chatJid);
                            if (mapped) {
                                senderPhone = mapped;
                            }
                        }
                    }
                }

                // helper flag
                const senderIsLid = isLidJid(chatJid);

                // remoteJid dipakai oleh logic lama untuk kirim balasan
                const remoteJid = chatJid;

                // Cek log jika ada perubahan JID (Artinya mapping berhasil)
                if (rawRemoteJid !== remoteJid) {
                    console.log(`🔄 Mapping LID detect: ${rawRemoteJid} -> ${remoteJid} (${senderPhone})`);
                }

                const isAdmin = ADMIN_PHONES.has(normalizePhone(senderPhone));

                const receivedAt = getMessageDate(msg);
                const tanggalWib = getWibIsoDate(receivedAt);

                const closed = isSystemClosed(receivedAt);
                const processingDayKey = getProcessingDayKey(receivedAt);
                const mAny: any = msg.message as any;

                const messageText =
                    mAny?.conversation ||
                    mAny?.extendedTextMessage?.text ||
                    mAny?.imageMessage?.caption ||
                    mAny?.videoMessage?.caption ||
                    '';

                const selectedRowId = mAny?.listResponseMessage?.singleSelectReply?.selectedRowId;
                const selectedButtonId =
                    mAny?.buttonsResponseMessage?.selectedButtonId ||
                    mAny?.templateButtonReplyMessage?.selectedId;

                const rawInput = selectedRowId || selectedButtonId || messageText;
                
                // Jika pesan adalah gambar/video tanpa caption, beritahu user
                if (!rawInput && (mAny?.imageMessage || mAny?.videoMessage)) {
                    await sock.sendMessage(remoteJid, { text: `⚠️ Maaf, saya tidak bisa membaca gambar/foto

Format yang diterima seperti ini:
Kirim data dengan urutan 4 baris kebawah:

1. Nama
2. Nomor Kartu
3. Nomor KTP (NIK)
4. Nomor KK

✅ Contoh:
Budi
5049488500001111
3173444455556666
3173555566667777

Jika lebih dari 1 data seperti ini:
Budi
5049488500001111
3173444455556666
3173555566667777

Agus Sedih
5049488522223333
3173000011112222
3173888877776666

Dan seterusnya.

Silakan ketik pesan teks atau kirim MENU untuk melihat pilihan.` });
                    continue;
                }
                
                if (!rawInput) continue;

                // ✅ KHUSUS AKUN @lid: kalau belum ada mapping nomor, minta user ketik nomor manual
                // PENTING: Hanya proses jika input SATU BARIS (bukan data sembako multi-baris)
                const inputLines = String(rawInput).trim().split('\n').filter(l => l.trim());
                const isSingleLineInput = inputLines.length === 1;
                
                if (senderIsLid && (!senderPhone || senderPhone === chatJid.replace('@lid', '')) && isSingleLineInput) {
                    // Cek format NAMA#NOMOR atau NAMA NOMOR (Space)
                    let candidatePhone: string | null = null;
                    let candidateName: string | null = msg.pushName || null;

                    const text = String(rawInput).trim();
                    const phoneFound = extractManualPhone(text);

                    if (phoneFound) {
                        // Cek apakah nomor ini sudah terdaftar
                        const existingUser = await getRegisteredUserByPhone(phoneFound);
                        if (existingUser && existingUser.lid_jid && existingUser.lid_jid !== chatJid) {
                            // Nomor sudah ada tapi LID berbeda - ini kemungkinan user pindah device/bot ganti nomor
                            // UPDATE LID-nya agar user bisa lanjut pakai
                            await updateLidForPhone(phoneFound, chatJid);
                            await sock.sendMessage(remoteJid, { 
                                text: `✅ Selamat datang kembali!\nNomor Anda (${phoneFound}) sudah dikenali.\n\nSilakan kirim pesan lagi (ketik MENU atau langsung kirim data).` 
                            });
                            // PENTING: continue di sini, agar pada pesan berikutnya LID sudah ter-mapping
                            continue;
                        }
                        
                        candidatePhone = phoneFound;
                        // Ambil nama: hapus nomor dari text (termasuk format 08xxx dan 628xxx)
                        const phoneOriginal = phoneFound.replace('62', '0'); // 6285xxx -> 085xxx
                        let cleanName = text
                            .replace(phoneOriginal, '') // Hapus format 08xxx
                            .replace(phoneFound, '')    // Hapus format 62xxx (jika user ketik begitu)
                            .replace(/\d{8,}/g, '')     // Hapus sisa digit panjang
                            .replace(/[#\-]/g, '')      // Hapus delimiter
                            .replace(/\s+/g, ' ')       // Rapikan spasi
                            .trim();
                        if (cleanName) {
                            candidateName = cleanName;
                        }
                    }

                    if (candidatePhone) {
                        try {
                            await upsertLidPhoneMap({ lid_jid: chatJid, phone_number: candidatePhone, push_name: candidateName });
                            senderPhone = candidatePhone;
                            const sapa = candidateName ? `, ${candidateName}` : '';
                            await sock.sendMessage(remoteJid, { text: `✅ Nomor kamu sudah dicatat: ${candidatePhone}\nSilakan lanjut.` });
                            // lanjutkan proses setelah nomor ada (tidak continue)
                        } catch (e: any) {
                            await sock.sendMessage(remoteJid, { text: `❌ Gagal menyimpan nomor. Coba lagi.` });
                            continue;
                        }
                    } else {
                        await sock.sendMessage(remoteJid, { text: `Nomor HP kamu belum terdaftar di sistem.\n\nSilakan masukkan NAMA dan NOMOR HP kamu (bisa pisah spasi) agar otomatis tersimpan.\n\nContoh:\n*Budi 085988880000*` });
                        continue;
                    }
                }

                // --- 🛡️ CEK REGISTRASI WAJIB (BLOCKING FILTER) ---
                // Cek apakah user sudah punya nama di database
                // PRIORITAS: 1) Cache, 2) Direct DB query by phone (untuk fix setelah ganti nomor bot)
                let existingName = getRegisteredUserNameSync(senderPhone);

                // Helper: Cek apakah valid phone number Indonesia/Internasional (bukan LID acak)
                const isValidIdPhone = (p: string) => {
                    return (p.startsWith('62') || p.startsWith('08')) && p.length >= 10 && p.length <= 15;
                };

                // Jika cache miss, coba query langsung ke DB by phone_number (fix untuk LID yang berubah setelah ganti nomor bot)
                if (!existingName && senderPhone) {
                    const dbLookup = await getRegisteredUserByPhone(senderPhone);
                    if (dbLookup && dbLookup.push_name) {
                        existingName = dbLookup.push_name;
                        console.log(`✅ User ditemukan via DB lookup: ${senderPhone} -> ${existingName}`);
                        
                        // Auto-update LID jika berubah 
                        if (dbLookup.lid_jid && dbLookup.lid_jid !== chatJid && chatJid.includes('@lid')) {
                             await updateLidForPhone(senderPhone, chatJid);
                        }
                    }
                }

                // Helper for command normalization
                const normalized = normalizeIncomingCommand(rawInput);
                const rawTrim = (rawInput || '').toString().trim();

                // --- LOGIC VERIFIKASI USER BARU ---
                // Jika belum terdaftar, cek apakah user kirim Nomor HP untuk verifikasi?
                if (!existingName) {
                     // Cek input apakah murni angka/nomor hp?
                     const possiblePhoneVerify = extractManualPhone(rawTrim.split('\n')[0]);
                     
                     // Syarat: Input adalah nomor HP, hanya 1 baris, dan pendek (bukan setoran)
                     if (possiblePhoneVerify && rawTrim.split('\n').length === 1 && rawTrim.length < 50) {
                         // Validasi format nomor
                         if (isValidIdPhone(possiblePhoneVerify)) {
                             // Cek apakah nomor ini ada di DB?
                             const targetUser = await getRegisteredUserByPhone(possiblePhoneVerify);
                             
                             let finalName = '';
                             if (targetUser && targetUser.push_name) {
                                 finalName = targetUser.push_name;
                                 console.log(`♻️ Verifikasi LID (Existing): ${chatJid} -> ${possiblePhoneVerify} (${finalName})`);
                             } else {
                                 finalName = msg.pushName || 'User Baru';
                                 console.log(`🆕 Verifikasi LID (New): ${chatJid} -> ${possiblePhoneVerify} (Name: ${finalName})`);
                             }

                             // SIMPAN / UPDATE MAPPING
                             await upsertLidPhoneMap({
                                 lid_jid: chatJid,
                                 phone_number: possiblePhoneVerify,
                                 push_name: finalName
                             });

                             // Update Context Saat Ini
                             senderPhone = possiblePhoneVerify;
                             existingName = finalName;

                             // Reply Sukses & Panduan Input
                             const exampleFormat = `Budi\n5049488500001111\n3173444455556666\n3173555566667777`;
                             const exampleFormat2 = `Budi\nKjp 5049488500001111\nKtp 3173444455556666\nKk 3173555566667777`;

                             await sock.sendMessage(remoteJid, { 
                                 text: `✅ *Nomor kamu sudah dicatat: ${possiblePhoneVerify}*\nSilakan lanjut.\n\n` +
                                       `📋 *Selanjutnya silakan kirim data yang akan didaftarkan dengan format seperti ini:*\n\n` +
                                       `1. Nama\n2. Nomor Kartu\n3. Nomor KTP (NIK)\n4. Nomor KK\n\n` +
                                       `*Contoh 1:*\n${exampleFormat}\n\n` +
                                       `*Contoh 2:*\n` + exampleFormat2
                             });
                             return; // Stop disini agar user baca panduan
                         }
                     }
                }

                // --- AUTO-REGISTER LOGIC (STRICT) ---
                if (!existingName) {
                    // KASUS 1: Sender Phone VALID (Misal user chat biasa/android)
                    if (senderPhone && isValidIdPhone(senderPhone)) {
                        const autoName = msg.pushName || 'User Baru';
                        await upsertLidPhoneMap({
                            lid_jid: chatJid,
                            phone_number: senderPhone,
                            push_name: autoName
                        });
                        existingName = autoName;
                    }
                    // KASUS 2: Sender Phone TIDAK VALID (LID 7933...) -> BLOKIR & MINTA VERIF
                    else {
                        console.log(`⛔ Blocked unknown LID: ${senderPhone}`);
                        await sock.sendMessage(remoteJid, {
                            text: `⛔ *SISTEM TIDAK MENGENALI PERANGKAT ANDA*\n\nMohon ketik **NOMOR HP ANDA** (Contoh: 08123456789) satu kali untuk verifikasi.\n\n_Agar system bisa memproses data pendaftaran kjp anda._`
                        });
                        return; // STOP PROCESSING
                    }
                }
                
                let replyText = '';

                // Helper for Date Parsing
                const toIsoFromDMY = (dmy: string): string | null => {
                    const m = (dmy || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
                    if (!m) return null;
                    const dd = m[1]; const mm = m[2]; const yyyy = m[3];
                    return `${yyyy}-${mm}-${dd}`;
                };

                const exactMenuWords = new Set([
                    'HALO', 'HI', 'P', 'TEST', 'PING', 'ASSALAMUALAIKUM', 'START', 'MENU', 'INFO', 'BANTUAN'
                ]);

                const isGreetingOrMenu = (text: string) => {
                    const up = (text || '').trim().toUpperCase();
                    if (exactMenuWords.has(up)) return true;
                    if (up.startsWith('SELAMAT')) return true;
                    return false;
                };

                const linesForData = parseRawMessageToLines(messageText);
                const looksLikeRegistrationData = linesForData.length >= 4 && linesForData.length % 4 === 0;

                // --- MENU USER LOGIC ---
                // Helper to render check data result
                const renderCheckDataResult = async (targetDate: string, dateLabel: string) => {
                   try {
                        const { validCount, totalInvalid, detailItems, validItems } = await getTodayRecapForSender(
                            senderPhone,
                            targetDate
                        );
                        const dDate = targetDate.split('-').reverse().join('-');
                        if (validCount > 0 || totalInvalid > 0) {
                            return buildReplyForTodayRecap(validCount, totalInvalid, validItems, targetDate).replace('REKAP INPUT DATA HARI INI', `REKAP INPUT DATA (${dateLabel} ${dDate})`);
                        } else {
                            return `📄 *CEK DATA (${dateLabel} ${dDate})*\n\nAnda belum kirim data pada tanggal tersebut.`;
                        }
                   } catch (err) {
                       console.error(err);
                       return '❌ Gagal mengambil data.';
                   }
                };

                const currentUserFlow = userFlowByPhone.get(senderPhone) || 'NONE';

                // Handle Reset Flow jika user ketik Menu/Greeting
                if (currentUserFlow !== 'NONE' && (normalized === '0' || isGreetingOrMenu(normalized))) {
                    userFlowByPhone.set(senderPhone, 'NONE');
                    // Lanjut ke handler menu utama di bawah
                } 
                else if (currentUserFlow === 'CHECK_DATA_MENU') {
                    if (normalized === '1') {
                        // CEK HARI INI
                        replyText = await renderCheckDataResult(processingDayKey, 'HARI INI');
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '2') {
                        // CEK KEMARIN
                        const yesterday = shiftIsoDate(processingDayKey, -1);
                        replyText = await renderCheckDataResult(yesterday, 'KEMARIN');
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '3') {
                        // CEK TANGGAL LAIN
                        userFlowByPhone.set(senderPhone, 'CHECK_DATA_SPECIFIC_DATE');
                        replyText = '📅 Silakan ketik tanggal yang ingin dicek (Format: DD-MM-YYYY):';
                    } else {
                        replyText = '⚠️ Pilih 1, 2, atau 3.';
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'CHECK_DATA_SPECIFIC_DATE') {
                    const iso = toIsoFromDMY(rawTrim);
                    if (!iso) {
                        replyText = '⚠️ Format tanggal salah. Gunakan DD-MM-YYYY (Contoh: 14-01-2026).';
                    } else {
                        replyText = await renderCheckDataResult(iso, 'TANGGAL');
                        userFlowByPhone.set(senderPhone, 'NONE');
                    }
                    await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'DELETE_DATA') {
                    // Logic processing input angka untuk hapus
                    const choice = parseInt(normalized);
                    if (isNaN(choice)) {
                         replyText = '⚠️ Mohon ketik angka nomor urut yang ingin dihapus. Ketik 0 untuk batal.';
                    } else if (choice === 0) {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        replyText = '✅ Penghapusan data dibatalkan.';
                    } else {
                        // Coba hapus
                         const res = await deleteDailyDataByIndex(senderPhone, processingDayKey, choice);
                         if (res.success) {
                             replyText = `✅ Sukses menghapus data: *${res.deletedName}*`;
                             userFlowByPhone.set(senderPhone, 'NONE');
                         } else {
                             replyText = '❌ Gagal menghapus. Pastikan nomor urut benar dan coba lagi.';
                         }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }

                if (pendingDelete.has(senderPhone)) {
                    const isMenuOrCommand =
                        normalized === '0' ||
                        normalized === '1' ||
                        normalized === '2' ||
                        normalized === '3' ||
                        normalized.startsWith('ADMIN') ||
                        isGreetingOrMenu(normalized);

                    if (isMenuOrCommand || looksLikeRegistrationData) {
                        pendingDelete.delete(senderPhone);
                    } else {
                        const query = rawTrim;
                        const { success: delOk, count, mode, error: delErr } = await deleteDataByNameOrCard(
                            senderPhone,
                            processingDayKey,
                            query
                        );
                        pendingDelete.delete(senderPhone);

                        if (!delOk) {
                            console.error("Gagal hapus:", delErr);
                            replyText = '❌ *GAGAL MENGHAPUS DATA*\nTerjadi kendala saat menghapus data. Mohon coba lagi.';
                        } else if (count > 0) {
                            replyText = ['✅ *DATA BERHASIL DIHAPUS*', '', 'Data pendaftaran telah berhasil dihapus.', 'Terima kasih 🙏'].join('\n');
                        } else {
                            const hint = mode === 'number' ? 'Pastikan nomor sama persis.' : 'Pastikan nama mengandung kata kunci tersebut.';
                            replyText = [
                                '❌ *DATA TIDAK DITEMUKAN*',
                                '',
                                'Mohon maaf, data yang Anda maksudkan tidak ditemukan di pendaftaran hari ini.',
                                hint,
                                'Silakan periksa kembali (Gunakan Menu 2 Cek Data).',
                            ].join('\n');
                        }
                    }
                }

                // --- MENU ADMIN ---
                const dmyExample = processingDayKey.split('-').reverse().join('-');
                
                const getPastKey = (daysBack: number) => shiftIsoDate(processingDayKey, -daysBack);
                const currentAdminFlow = adminFlowByPhone.get(senderPhone) ?? 'NONE';

                const openAdminMenu = async () => {
                    adminFlowByPhone.set(senderPhone, 'MENU');
                    pendingDelete.delete(senderPhone);
                    await sock.sendMessage(remoteJid, { text: ADMIN_MENU_MESSAGE });
                };

                if (isAdmin && (normalized === '0' || normalized === 'ADMIN' || normalized === 'ADMIN MENU')) {
                    await openAdminMenu();
                    continue;
                }

                if (isAdmin && currentAdminFlow !== 'NONE') {
                    if (normalized === '0' || isGreetingOrMenu(normalized)) {
                        adminFlowByPhone.set(senderPhone, 'NONE');
                        await sendMainMenu(sock, remoteJid, isAdmin);
                        continue;
                    }

                    const lookupName = (phone: string) => {
                        const jid = phone + '@s.whatsapp.net';
                        const c = store.contacts[jid];
                        return c?.name || c?.notify || null;
                    };

                    if (currentAdminFlow === 'MENU') {
                        if (normalized === '1') replyText = await getGlobalRecap(processingDayKey, undefined, lookupName);
                        else if (normalized === '2') replyText = await getGlobalRecap(getPastKey(6), processingDayKey, lookupName);
                        else if (normalized === '3') replyText = await getGlobalRecap(getPastKey(29), processingDayKey, lookupName);
                        else if (normalized === '4') {
                            adminFlowByPhone.set(senderPhone, 'ASK_DATE');
                            replyText = ['📅 *REKAP TANGGAL*', '', `Contoh: *${dmyExample}*`, '', '_Ketik 0 untuk kembali._'].join('\n');
                        } else if (normalized === '5') {
                            adminFlowByPhone.set(senderPhone, 'ASK_RANGE');
                            replyText = ['📅 *REKAP RENTANG*', '', `Contoh: *01-01-2026 ${dmyExample}*`, '', '_Ketik 0 untuk kembali._'].join('\n');
                        } else if (normalized === '6') {
                            adminFlowByPhone.set(senderPhone, 'RESET_CONFIRM');
                            replyText = ['⚠️ *KONFIRMASI RESET*', '', `Periode: *${dmyExample}*`, '1️⃣ Ya, Hapus', '2️⃣ Batal'].join('\n');
                        } else if (normalized === '7') {
                            adminFlowByPhone.set(senderPhone, 'ADD_CONTACT');
                            replyText = ['➕ *TAMBAH KONTAK*', 'Ketik: Nama NomorHP', 'Contoh: Budi 0812345'].join('\n');
                        } else if (normalized === '8') {
                            adminFlowByPhone.set(senderPhone, 'CHECK_CONTACT');
                            replyText = ['🔍 *CEK KONTAK*', 'Ketik: Nomor HP', 'Contoh: 0812345'].join('\n');
                        } else if (normalized === '9') {
                            adminFlowByPhone.set(senderPhone, 'EDIT_CONTACT');
                            replyText = ['✏️ *EDIT KONTAK*', 'Ketik: NamaBaru NomorHP', 'Contoh: BudiRevisi 0812345'].join('\n');
                        } else if (normalized === '10') {
                            adminFlowByPhone.set(senderPhone, 'DELETE_CONTACT');
                            const allContacts = await getAllLidPhoneMap();
                            
                            // SIMPAN SNAPSHOT KE CACHE
                            adminContactCache.set(senderPhone, allContacts);
                            
                            if (allContacts.length === 0) {
                                replyText = '📂 Tidak ada kontak untuk dihapus.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                let msg = '🗑️ *HAPUS KONTAK*\n\n';
                                // Tampilkan max 50 agar tidak kepanjangan (atau full jika user mau risiko)
                                // Kita batasi display text agar tidak error WA
                                for (let i = 0; i < allContacts.length; i++) {
                                    const c = allContacts[i];
                                    msg += `${i + 1}. ${c.push_name || '(Tanpa Nama)'} (${c.phone_number})\n`;
                                    if (msg.length > 3500) {
                                        msg += '\n...(List dipotong, terlalu panjang)...';
                                        break;
                                    }
                                }
                                msg += '\n👇 *Ketik nomor urut yg ingin dihapus (bisa banyak, pisah koma/spasi)*\nContoh: 1, 3, 5\n\n_Ketik 0 untuk batal._';
                                replyText = msg;
                            }
                        } else if (normalized === '11') {
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_SELECT');
                            replyText = [
                                '📢 *BROADCAST INFO*',
                                '',
                                'Pilih target pengiriman:',
                                '',
                                '1️⃣ Kirim ke SEMUA kontak',
                                '2️⃣ Kirim ke nomor tertentu',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '12') {
                            // FEATURE: LIST SEMUA KONTAK (langsung tampilkan)
                            const allContacts = await getAllLidPhoneMap();
                            if (allContacts.length === 0) {
                                replyText = '📂 Belum ada kontak terdaftar.';
                            } else {
                                await sock.sendMessage(remoteJid, { text: `📂 *DAFTAR SEMUA KONTAK (${allContacts.length})*` });
                                
                                let currentMsg = '';
                                for (let i = 0; i < allContacts.length; i++) {
                                    const c = allContacts[i];
                                    const line = `${i + 1}. ${c.push_name || '(Tanpa Nama)'} (${c.phone_number})\n`;
                                    
                                    if (currentMsg.length + line.length > 3000) {
                                        await sock.sendMessage(remoteJid, { text: currentMsg });
                                        currentMsg = '';
                                    }
                                    currentMsg += line;
                                }
                                if (currentMsg) {
                                    replyText = currentMsg;
                                } else {
                                    replyText = '✅ Selesai.';
                                }
                            }
                        } else if (normalized === '13') {
                            // FEATURE: STATISTIK DASHBOARD
                            const stats = await getStatistics(processingDayKey);
                            const displayDate = processingDayKey.split('-').reverse().join('-');
                            
                            const lines = [
                                '📊 *STATISTIK DASHBOARD*',
                                `📅 Per Tanggal: ${displayDate}`,
                                '',
                                '📈 *RINGKASAN DATA:*',
                                `├ Hari Ini: *${stats.todayCount}* data`,
                                `├ 7 Hari Terakhir: *${stats.weekCount}* data`,
                                `└ 30 Hari Terakhir: *${stats.monthCount}* data`,
                                '',
                                '👥 *PENGGUNA AKTIF:*',
                                `├ Hari Ini: *${stats.activeUsersToday}* orang`,
                                `├ 7 Hari Terakhir: *${stats.activeUsersWeek}* orang`,
                                `└ Total Terdaftar: *${stats.totalRegisteredUsers}* orang`,
                            ];
                            
                            if (stats.topUsers.length > 0) {
                                lines.push('');
                                lines.push('🏆 *TOP 10 PENGIRIM HARI INI:*');
                                stats.topUsers.forEach((u, i) => {
                                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
                                    lines.push(`${medal} ${i + 1}. ${u.name} (${u.count} data)`);
                                });
                            }
                            
                            replyText = lines.join('\n');
                        } else if (normalized === '14') {
                            // FEATURE: CARI DATA
                            adminFlowByPhone.set(senderPhone, 'SEARCH_DATA');
                            replyText = [
                                '🔍 *CARI DATA*',
                                '',
                                'Ketik keyword pencarian:',
                                '• Nama penerima (contoh: Budi)',
                                '• Nama pengirim WA (contoh: Tari)',
                                '• No Kartu (contoh: 5049488500001111)',
                                '• No HP (contoh: 628123456789)',
                                '',
                                '_Pencarian di SEMUA tanggal._',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '15') {
                            // FEATURE: LOG AKTIVITAS
                            const { data: logs, error } = await supabase
                                .from('log_pesan_wa')
                                .select('*')
                                .eq('processing_day_key', processingDayKey)
                                .order('received_at', { ascending: false })
                                .limit(50);
                            
                            if (error || !logs || logs.length === 0) {
                                replyText = '📋 Belum ada aktivitas hari ini.';
                            } else {
                                const dateDisplay = processingDayKey.split('-').reverse().join('-');
                                const lines = [
                                    '📋 *LOG AKTIVITAS HARI INI*',
                                    `📅 Tanggal: ${dateDisplay}`,
                                    `📊 Menampilkan: ${logs.length} aktivitas terakhir`,
                                    ''
                                ];
                                
                                (logs as any[]).forEach((log, i) => {
                                    const timeStr = new Date(log.received_at).toLocaleTimeString('id-ID', { 
                                        hour: '2-digit', 
                                        minute: '2-digit',
                                        timeZone: 'Asia/Jakarta'
                                    });
                                    const senderName = getRegisteredUserNameSync(log.sender_phone) || log.sender_phone;
                                    
                                    // FIX: Ambil dari kolom database langsung, bukan dari property .stats yang mungkin tidak ada di level root row
                                    const okCount = log.stats_ok_count ?? 0;
                                    const totalBlocks = log.stats_total_blocks ?? 0;
                                    const failCount = totalBlocks - okCount;
                                    
                                    let statusIcon = '✅';
                                    if (failCount > 0 && okCount === 0) statusIcon = '❌';
                                    else if (failCount > 0) statusIcon = '⚠️';
                                    
                                    lines.push(`${i + 1}. ${statusIcon} *${senderName}* (${timeStr})`);
                                    lines.push(`   📥 ${totalBlocks} data | ✅ ${okCount} OK | ❌ ${failCount} Gagal`);
                                });
                                
                                replyText = lines.join('\n');
                            }
                        } else if (normalized === '16') {
                            // FEATURE: EXPORT DATA (CSV & TXT)
                            await sock.sendMessage(remoteJid, { text: '⏳ Sedang menyiapkan file export...' });
                            
                            // Helper untuk lookup nama (bisa pakai registeredUsersCache)
                            const lookupName = (ph: string) => getRegisteredUserNameSync(ph) || undefined;
                            
                            const exportResult = await generateExportData(processingDayKey, lookupName);
                            
                            if (!exportResult || exportResult.count === 0) {
                                replyText = '📂 Belum ada data pendaftaran hari ini untuk diexport.';
                            } else {
                                // Kirim CSV
                                const csvBuffer = Buffer.from(exportResult.csv, 'utf-8');
                                await sock.sendMessage(remoteJid, {
                                    document: csvBuffer,
                                    mimetype: 'text/csv',
                                    fileName: `${exportResult.filenameBase}.csv`,
                                    caption: `📊 Export CSV (${exportResult.count} data)`
                                });
                                
                                // Kirim TXT
                                const txtBuffer = Buffer.from(exportResult.txt, 'utf-8');
                                await sock.sendMessage(remoteJid, {
                                    document: txtBuffer,
                                    mimetype: 'text/plain',
                                    fileName: `${exportResult.filenameBase}.txt`,
                                    caption: `📄 Export TXT (${exportResult.count} data)`
                                });
                                
                                replyText = '✅ Export data selesai.';
                            }
                        } else replyText = '⚠️ Pilihan tidak dikenali.';
                    } else if (currentAdminFlow === 'SEARCH_DATA') {
                        // SEARCH ALL DATA
                        const q = rawTrim;
                        const qUpper = q.toUpperCase();
                        const digits = q.replace(/\D/g, '');
                        
                        // Cari nomor HP dari nama kontak WA yang cocok
                        const matchedPhones: string[] = [];
                        const allContacts = await getAllLidPhoneMap();
                        allContacts.forEach(c => {
                            if (c.push_name && c.push_name.toUpperCase().includes(qUpper)) {
                                matchedPhones.push(c.phone_number);
                            }
                        });
                        
                        let query = supabase
                            .from('data_harian')
                            .select('*')
                            .order('received_at', { ascending: false })
                            .limit(30);
                        
                        // Build OR condition
                        const orParts: string[] = [];
                        if (q.length >= 2) orParts.push(`nama.ilike.%${qUpper}%`);
                        if (digits.length >= 4) {
                            orParts.push(`no_kjp.eq.${digits}`);
                            orParts.push(`no_ktp.eq.${digits}`);
                            orParts.push(`sender_phone.eq.${digits}`);
                        }
                        // Tambahkan pencarian berdasarkan nama pengirim WA
                        matchedPhones.forEach(phone => {
                            orParts.push(`sender_phone.eq.${phone}`);
                        });
                        
                        if (orParts.length === 0) {
                            replyText = '⚠️ Keyword terlalu pendek. Minimal 2 huruf atau 4 digit.';
                        } else {
                            const { data, error } = await query.or(orParts.join(','));
                            
                            if (error || !data || data.length === 0) {
                                replyText = `❌ *DATA TIDAK DITEMUKAN*\nKeyword: "${q}"`;
                            } else {
                                const lines = [
                                    `🔍 *HASIL PENCARIAN: "${q}"*`,
                                    `📊 Ditemukan: ${data.length} data (max 30)`,
                                    ''
                                ];
                                
                                (data as any[]).forEach((row, i) => {
                                    const dateDisplay = String(row.processing_day_key).split('-').reverse().join('-');
                                    const senderName = getRegisteredUserNameSync(row.sender_phone) || row.sender_phone;
                                    lines.push(`${i + 1}. *${row.nama}* (${dateDisplay})`);
                                    lines.push(`   💳 Kartu: ${row.no_kjp}`);
                                    lines.push(`   📱 Pengirim: ${senderName}`);
                                    lines.push('');
                                });
                                
                                replyText = lines.join('\n');
                            }
                        }
                        adminFlowByPhone.set(senderPhone, 'MENU');
                    } else if (currentAdminFlow === 'ASK_DATE') {
                        const iso = toIsoFromDMY(rawTrim);
                        replyText = !iso ? '⚠️ Format salah.' : await getGlobalRecap(iso, undefined, lookupName);
                        if (iso) adminFlowByPhone.set(senderPhone, 'MENU');
                    } else if (currentAdminFlow === 'ASK_RANGE') {
                        const parts = rawTrim.split(/\s+/);
                        const d1 = toIsoFromDMY(parts[0]);
                        const d2 = toIsoFromDMY(parts[1]);
                        replyText = (!d1 || !d2) ? '⚠️ Format salah.' : await getGlobalRecap(d1, d2, lookupName);
                        if (d1 && d2) adminFlowByPhone.set(senderPhone, 'MENU');
                    } else if (currentAdminFlow === 'RESET_CONFIRM') {
                        if (normalized === '1') {
                            await sock.sendMessage(remoteJid, { text: '⏳ Menghapus...' });
                            replyText = (await clearDatabaseForProcessingDayKey(processingDayKey)) ? '✅ Berhasil.' : '❌ Gagal.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = '✅ Dibatalkan.';
                        } else replyText = '⚠️ Pilih 1 atau 2.';
                    } else if (currentAdminFlow === 'ADD_CONTACT' || currentAdminFlow === 'EDIT_CONTACT') {
                        const phoneInput = extractManualPhone(rawTrim);
                        if (phoneInput) {
                            const nameInput = rawTrim.replace(phoneInput, '')
                                .replace(phoneInput.replace('62', '0'), '')
                                .replace(/\d{9,}/g, '')
                                .replace(/[#\-]/g, '')
                                .trim();
                            if (nameInput.length > 2) {
                                // Assume LID JID is just phone@s.whatsapp.net for manual entry if we don't know the LID
                                const targetJid = phoneInput + '@s.whatsapp.net';
                                await upsertLidPhoneMap({
                                    lid_jid: targetJid,
                                    phone_number: phoneInput,
                                    push_name: nameInput
                                });
                                replyText = `✅ Sukses simpan: ${nameInput} (${phoneInput})`;
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                replyText = '⚠️ Nama terlalu pendek/kosong. Ulangi format: Nama Nomor';
                            }
                        } else {
                            replyText = '⚠️ Nomor HP tidak terbaca. Ulangi format: Nama Nomor';
                        }
                    } else if (currentAdminFlow === 'CHECK_CONTACT') {
                        const phoneInput = extractManualPhone(rawTrim);
                        if (phoneInput) {
                            const name = await getNameFromLidPhoneMap(phoneInput);
                            replyText = name ? `👤 Nama: *${name}*\n📱 HP: ${phoneInput}` : `❌ Nomor ${phoneInput} belum terdaftar.`;
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else {
                            replyText = '⚠️ Format nomor salah.';
                        }
                    } else if (currentAdminFlow === 'DELETE_CONTACT') {
                        if (rawTrim === '0') {
                            replyText = '✅ Hapus kontak dibatalkan.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else {
                            // Coba parse index: "1, 2, 5" atau "1 2 5"
                            const parts = rawTrim.split(/[,\s]+/);
                            const indices = parts.map((p: string) => parseInt(p.trim())).filter((n: number) => !isNaN(n) && n > 0);
                            
                            // Jika input terlihat seperti daftar angka (index), gunakan logic delete by index
                            // Syarat: minimal 1 angka valid dan input tidak terlalu panjang (bukan nomor HP)
                            const looksLikeIndex = indices.length > 0 && (indices.length > 1 || String(indices[0]).length < 5);

                            if (looksLikeIndex) {
                                // AMBIL DARI CACHE (SNAPSHOT) AGAR INDEX TIDAK BERGESER
                                let contactsList = adminContactCache.get(senderPhone);
                                
                                // Fallback: Jika cache kosong (misal bot restart), fetch baru
                                if (!contactsList || contactsList.length === 0) {
                                    contactsList = await getAllLidPhoneMap();
                                }
                                
                                let successCount = 0;
                                let deletedNames: string[] = [];
                                
                                for (const idx of indices) {
                                    const target = contactsList[idx - 1]; // 0-based
                                    if (target) {
                                        // Delete by phone number (Idempotent: aman kalau dipanggil 2x)
                                        const ok = await deleteLidPhoneMap(target.phone_number);
                                        if (ok) {
                                            successCount++;
                                            deletedNames.push(target.push_name || target.phone_number);
                                        }
                                    }
                                }
                                
                                if (successCount > 0) {
                                    replyText = `✅ Berhasil menghapus ${successCount} kontak:\n- ${deletedNames.join('\n- ')}`;
                                } else {
                                    replyText = '❌ Gagal menghapus atau nomor urut salah/sudah terhapus.';
                                }
                                
                                // Bersihkan cache setelah selesai
                                adminContactCache.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                // Fallback: mungkin user input nomor HP manual (legacy support)
                                const phoneInput = extractManualPhone(rawTrim);
                                if (phoneInput) {
                                    const deleted = await deleteLidPhoneMap(phoneInput);
                                    replyText = deleted ? `✅ Berhasil menghapus data ${phoneInput}` : `❌ Gagal/Data tidak ditemukan.`;
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                } else {
                                    replyText = '⚠️ Input tidak valid. Masukkan angka nomor urut (contoh: 1, 3). Ketik 0 untuk batal.';
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BROADCAST_SELECT') {
                        if (normalized === '1') {
                            // SEMUA kontak
                            broadcastDraftMap.set(senderPhone, { targets: [], message: '' }); 
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_MSG');
                            replyText = ['📢 *BROADCAST KE SEMUA*', '', 'Ketik pesan yang akan dikirim:', '', '_(Ketik 0 untuk batal)_'].join('\n');
                        } else if (normalized === '2') {
                            // Nomor tertentu
                            broadcastDraftMap.set(senderPhone, { targets: [], message: '', isPendingNumbers: true });
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_MSG');
                            replyText = [
                                '📢 *BROADCAST KE NOMOR TERTENTU*',
                                '',
                                'Ketik nomor HP tujuan (pisahkan dengan koma/enter), lalu kirim pesan.',
                                '',
                                'Format:',
                                '08123456789, 08234567890',
                                'Pesan broadcast Anda...',
                                '',
                                '_(Ketik 0 untuk batal)_'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilih 1 (Semua) atau 2 (Nomor tertentu).';
                        }
                    } else if (currentAdminFlow === 'BROADCAST_MSG') {
                        if (rawTrim.length < 5) {
                            replyText = '⚠️ Pesan terlalu pendek. Batal broadcast tekan 0.';
                        } else {
                            const draft = broadcastDraftMap.get(senderPhone) || { targets: [], message: '' };
                            
                            let targetsToSend: string[] = [];
                            let messageToSend = rawTrim;

                            // LOGIC PARSING TARGET
                            if (draft.isPendingNumbers) {
                                // User kirim "Nomor\nPesan"
                                const lines = rawTrim.split('\n');
                                const firstLine = lines[0] || '';
                                
                                const phoneMatches = firstLine.match(/(?:\+?62|0)\s*8[\d\s\-\.]{8,15}/g) || [];
                                const normalizedPhones = phoneMatches.map((p: string) => {
                                    let s = p.replace(/[^\d]/g, '');
                                    if (s.startsWith('0')) s = '62' + s.slice(1);
                                    return s;
                                }).filter((p: string) => p.length >= 10);
                                
                                if (normalizedPhones.length === 0) {
                                    replyText = '⚠️ Nomor HP tidak ditemukan. Ulangi format:\n08123, 08234\nPesan Anda...';
                                    await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }
                                
                                targetsToSend = normalizedPhones;
                                messageToSend = lines.slice(1).join('\n').trim();
                            } else {
                                // Kirim ke SEMUA
                                // Kita fetch semua sekarang untuk preview count
                                const allContacts = await getAllLidPhoneMap();
                                targetsToSend = allContacts.map(c => c.phone_number);
                            }

                            if (messageToSend.length < 5) {
                                replyText = '⚠️ Pesan kosong/terlalu pendek. Ulangi input.';
                                await sock.sendMessage(remoteJid, { text: replyText });
                                continue;
                            }

                            // UPDATE DRAFT
                            draft.targets = targetsToSend;
                            draft.message = messageToSend;
                            draft.isPendingNumbers = false; 
                            broadcastDraftMap.set(senderPhone, draft);

                            // SHOW PREVIEW
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_PREVIEW');
                            
                            replyText = [
                                '🔍 *PREVIEW BROADCAST*',
                                '',
                                `👥 *Penerima:* ${targetsToSend.length} Kontak`,
                                '📝 *Isi Pesan:*',
                                '------------------',
                                messageToSend,
                                '------------------',
                                '',
                                '1️⃣ Kirim Sekarang',
                                '2️⃣ Jadwalkan Kirim (WIP)',
                                '0️⃣ Batal'
                            ].join('\n');
                        }
                    } else if (currentAdminFlow === 'BROADCAST_PREVIEW') {
                         const draft = broadcastDraftMap.get(senderPhone);
                         if (!draft || draft.targets.length === 0) {
                             replyText = '❌ Data broadcast hilang. Silakan ulangi.';
                             adminFlowByPhone.set(senderPhone, 'MENU');
                         } else if (normalized === '1') {
                             // --- KIRIM SEKARANG ---
                             await executeBroadcast(sock, draft, remoteJid, senderPhone);
                             adminFlowByPhone.set(senderPhone, 'MENU');
                         } else if (normalized === '2') {
                             // --- JADWALKAN ---
                             replyText = '📅 Masukkan Tanggal & Jam (Format: DD-MM-YYYY HH:mm)\nContoh: 15-01-2026 08:30';
                             adminFlowByPhone.set(senderPhone, 'BROADCAST_SCHEDULE');
                         } else {
                             replyText = '❌ Broadcast dibatalkan.';
                             adminFlowByPhone.set(senderPhone, 'MENU');
                             broadcastDraftMap.delete(senderPhone);
                         }
                    } else if (currentAdminFlow === 'BROADCAST_SCHEDULE') {
                        // Parse Time
                        const targetTimeStr = rawTrim; // DD-MM-YYYY HH:mm
                        try {
                            const [datePart, timePart] = targetTimeStr.split(' ');
                            if (!datePart || !timePart) throw new Error('Format salah');
                            
                            // Convert DD-MM-YYYY to YYYY-MM-DD
                            const [dd, mm, yyyy] = datePart.split('-');
                            if (!dd || !mm || !yyyy) throw new Error('Date format');

                            const isoDate = `${yyyy}-${mm}-${dd}T${timePart}:00`;
                            const targetDate = new Date(isoDate);

                            if (isNaN(targetDate.getTime())) throw new Error('Invalid Date');

                            const now = new Date();
                            const delay = targetDate.getTime() - now.getTime();

                            if (delay <= 0) {
                                replyText = '⚠️ Waktu sudah lewat. Masukkan waktu yang akan datang.';
                            } else {
                                const draft = broadcastDraftMap.get(senderPhone);
                                if (draft) {
                                    // Set Timeout
                                    replyText = `✅ Broadcast dijadwalkan pada *${targetTimeStr}*.\n\n⚠️ _(PERHATIAN: Jadwal akan hilang jika Bot restart)_`;
                                    
                                    setTimeout(() => {
                                        executeBroadcast(sock, draft, remoteJid, senderPhone).catch(console.error);
                                    }, delay);

                                    // Clear state but KEEP draft in memory (actually executeBroadcast will rely on passed draft object, so we can delete from map? No, closure keeps it. Safe to delete map entry if we don't need to edit it.)
                                    // Better: clone draft to closure.
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                    broadcastDraftMap.delete(senderPhone);
                                } else {
                                    replyText = '❌ Data draft hilang.';
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                }
                            }
                        } catch (e) {
                            replyText = '⚠️ Format salah. Gunakan DD-MM-YYYY HH:mm (Contoh: 15-01-2026 13:00). Ketik 0 untuk batal.';
                            if (normalized === '0') {
                                replyText = '❌ Penjadwalan dibatalkan.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }

                // --- CUSTOMER MENU ---
                if (normalized === '1' || normalized.includes('DAFTAR')) {
                    replyText = [
                        '📋 *FORMAT DAFTAR ANTREAN*',
                        'Silakan kirim data dengan urutan 4 baris kebawah:',
                        '',
                        '1. Nama',
                        '2. Nomor Kartu',
                        '3. Nomor KTP (NIK)',
                        '4. Nomor KK',
                        '',
                        '✅ *Contoh:*',
                        'JIKA KIRIM 1 DATA',
                        'Budi',
                        '5049488500001111',
                        '3173444455556666',
                        '3173555566667777',
                        '',
                        'JIKA KIRIM LEBIH DARI SATU',
                        'Budi',
                        '5049488500001111',
                        '3173444455556666',
                        '3173555566667777',
                        '',
                        'Agus',
                        '5049488522223333',
                        '3173000011112222',
                        '3173888877776666',
                        '',
                        'dan seterusnya',
                        '',
                        'penulisan nomor kartu/ktp/kk bebas (boleh pakai spasi, koma, titik, strip, dll).',
                        '',
                        'Mohon pastikan urutan data sudah sesuai agar pendaftaran dapat dicatat dengan baik 🙏',
                        '_(Anda bisa kirim banyak nama sekaligus, pisahkan dengan enter)_',
                    ].join('\n');
                } else if (normalized === '2' || normalized.startsWith('CEK')) {
                    pendingDelete.delete(senderPhone);
                    // NEW FLOW: Show Check Data Menu
                    userFlowByPhone.set(senderPhone, 'CHECK_DATA_MENU');
                    replyText = [
                        '📅 *CEK DATA*',
                        '',
                        'Pilih periode cek data:',
                        '1️⃣ Hari Ini',
                        '2️⃣ Kemarin',
                        '3️⃣ Tanggal Lain (DD-MM-YYYY)',
                        '',
                        '_Ketik 0 untuk batal._'
                    ].join('\n');
                } else if (normalized === '3' || normalized.includes('HAPUS DATA')) {
                    pendingDelete.delete(senderPhone); // disable old logic
                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);
                    
                    if (validCount === 0) {
                         replyText = '⚠️ Anda belum mengirim data pendaftaran hari ini.';
                    } else {
                        userFlowByPhone.set(senderPhone, 'DELETE_DATA');
                        const list = validItems.map((item, idx) => `${idx + 1}. ${item.nama} (${item.no_kjp})`).join('\n');
                        replyText = [
                            '🗑️ *HAPUS DATA*',
                            '',
                            'Ketik nomor urut untuk menghapus data:',
                            '',
                            list,
                            '',
                            'Ketik 0 untuk batal.'
                        ].join('\n');
                    }
                } else if (normalized === 'BATAL' || normalized === 'CANCEL' || normalized === 'UNDO') {
                    // FITUR BATAL: Hapus data terakhir dalam 30 menit
                    const result = await deleteLastSubmission(senderPhone, processingDayKey, 30);
                    
                    if (result.success && result.count > 0) {
                        const namesStr = result.names.join(', ');
                        replyText = [
                            '✅ *DATA BERHASIL DIBATALKAN*',
                            '',
                            `Jumlah data dihapus: ${result.count}`,
                            `Nama: ${namesStr}`,
                            '',
                            '_Data pendaftaran terakhir Anda telah dibatalkan._'
                        ].join('\n');
                    } else {
                        replyText = [
                            '⚠️ *TIDAK ADA DATA YANG BISA DIBATALKAN*',
                            '',
                            'Kemungkinan penyebab:',
                            '• Anda belum mengirim data hari ini',
                            '• Data sudah lebih dari 30 menit yang lalu',
                            '',
                            '_Fitur BATAL hanya berlaku untuk data yang dikirim dalam 30 menit terakhir._'
                        ].join('\n');
                    }
                } else if (normalized === '4' || normalized.includes('FAQ') || normalized.includes('BANTUAN')) {
                    replyText = FAQ_MESSAGE;
                } else {

                    // Logic Baru: Terima Partial Success
                    // Asal >= 4 baris, kita coba proses.
                    // Parser akan memisahkan valid blocks dan remainder.
                    const lines = parseRawMessageToLines(messageText);
                    if (lines.length >= 4) {
                        if (closed && !isAdmin) {
                            await sock.sendMessage(remoteJid, { text: [
                                '⛔ *MOHON MAAF, SISTEM SEDANG TUTUP*',
                                '(Maintenance Harian)',
                                '',
                                '🕒 Jam Tutup: *04.01 - 06.00 WIB*',
                                '✅ Buka Kembali: *Pukul 06.01 WIB*',
                                '',
                                '📌 Data yang Anda kirim sekarang *tidak akan diproses*.',
                                'Silakan kirim ulang setelah jam buka untuk pendaftaran besok.',
                                '',
                                '_Terima kasih atas pengertiannya._ 🙏'
                            ].join('\n') });
                            continue;
                        }
                        const logJson = await processRawMessageToLogJson({
                            text: messageText,
                            senderPhone,
                            messageId: msg.key.id,
                            receivedAt,
                            tanggal: tanggalWib,
                            processingDayKey,
                        });
                        
                        // INJECT SENDER NAME (untuk disimpan di tabe data_harian)
                        logJson.sender_name = existingName || undefined;

                        if (logJson.stats.total_blocks > 0 || (logJson.failed_remainder_lines && logJson.failed_remainder_lines.length > 0)) {
                            await saveLogAndOkItems(logJson, messageText);
                            
                            // Hitung total data hari ini SETELAH data disimpan
                            const totalDataToday = await getTotalDataTodayForSender(senderPhone, processingDayKey);
                            replyText = buildReplyForNewData(logJson, totalDataToday);
                        } else {
                            // Kasus langka: >= 4 baris tapi tidak ada blok valid satu pun?
                            // Harusnya masuk ke failed remainder semua.
                            // Tapi untuk safety:
                            replyText = '⚠️ *Format Salah*\nHarus 4 baris per orang. Ketik 1 untuk contoh.';
                        }
                    }
                }

                if (!replyText) {
                    if (isGreetingOrMenu(normalized)) {
                        pendingDelete.delete(senderPhone);
                        await sendMainMenu(sock, remoteJid, isAdmin);
                    } else {
                        // Cek apakah ini percobaan kirim data dengan format salah
                        const inputLineCount = parseRawMessageToLines(messageText).length;
                        
                        if (inputLineCount >= 1 && inputLineCount <= 3) {
                            // 1-3 baris = format salah
                            const formatGuide = `⚠️ *FORMAT SALAH*

Kirim data dalam *4 BARIS* sekaligus:

1. Nama
2. Nomor Kartu
3. Nomor KTP (NIK)
4. Nomor KK

Contoh:
Budi
5049488500001111
3173444455556666
3173555566667777

Ketik MENU untuk bantuan.`;
                            await sock.sendMessage(remoteJid, { text: formatGuide });
                        } else if (inputLineCount >= 5 && inputLineCount % 4 !== 0) {
                            // 5+ baris tapi bukan kelipatan 4
                            const formatGuide = `⚠️ *DATA TIDAK LENGKAP*

Jumlah baris harus kelipatan 4 (tiap orang = 4 baris).
Anda mengirim ${inputLineCount} baris.

Format per orang:
1. Nama
2. Nomor Kartu
3. Nomor KTP (NIK)
4. Nomor KK

Ketik MENU untuk bantuan.`;
                            await sock.sendMessage(remoteJid, { text: formatGuide });
                        } else {
                            // Input lain (mungkin emoji, stiker, dll)
                            await sock.sendMessage(remoteJid, { text: '🤔 Ketik MENU untuk melihat pilihan.' });
                        }
                    }
                    continue;
                }

                await sock.sendMessage(remoteJid, { text: replyText });
                console.log(`📤 Balasan terkirim ke ${senderPhone}`);
            } catch (error) {
                console.error('Error memproses pesan:', error);
            }
        }
    });
}

// --- HELPER FUNCTION: EXECUTE BROADCAST ---
async function executeBroadcast(sock: any, draft: BroadcastDraft, remoteJid: string, senderPhone: string) {
    const count = draft.targets.length;
    await sock.sendMessage(remoteJid, { text: `⏳ Mengirim pesan ke ${count} kontak...` });

    let successCount = 0;
    for (const phone of draft.targets) {
        try {
            const targetJid = phone + '@s.whatsapp.net';
            await sock.sendMessage(targetJid, { text: draft.message });
            successCount++;
            await new Promise(r => setTimeout(r, 1000)); // Delay aman
        } catch (e) {
            console.error(`Gagal broadcast ke ${phone}`);
        }
    }
    await sock.sendMessage(remoteJid, { text: `✅ Broadcast selesai.\nSukses kirim ke: ${successCount} dari ${count}.` });
}
