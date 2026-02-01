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
    getEditableItemsForSender,
    buildReplyForTodayRecap,
    getGlobalRecap,
    buildReplyForInvalidDetails,
    generateExportData,
} from './recap';
import {
    buildReplyForNewData,
} from './reply';
import { generateKJPExcel } from './services/excelService';
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
    deleteDailyDataByIndices, // NEW
    deleteAllDailyDataForSender, // NEW
    getRegisteredUserByPhone,
    updateLidForPhone,
    getPhoneFromLidSync,
    getTotalDataTodayForSender,
    getBotSettings,
    updateBotSettings,
    formatCloseTimeString,
    renderCloseMessage,
    clearBotSettingsCache,
    updateDailyDataField, // PATCH 2
} from './supabase';
import { getProcessingDayKey, getWibIsoDate, shiftIsoDate, isSystemClosed, getWibParts } from './time';
import { parseFlexibleDate, looksLikeDate } from './utils/dateParser';
import {
    MENU_MESSAGE,
    FORMAT_DAFTAR_MESSAGE,
    FORMAT_DAFTAR_PASARJAYA,
    FORMAT_DAFTAR_DHARMAJAYA,
    FAQ_MESSAGE,
    ADMIN_LAUNCHER_LINE,
    ADMIN_MENU_MESSAGE,
    ADMIN_PHONES_RAW,
    CLOSE_MESSAGE_TEMPLATE_UNIFIED,
    MENU_PASARJAYA_LOCATIONS, // NEW
    PASARJAYA_MAPPING, // NEW
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
    userLocationChoice, // IMPORTED
    userSpecificLocationChoice, // NEW - Lokasi spesifik (contoh: "PASARJAYA - Jakgrosir Kedoya")
    adminFlowByPhone,
    pendingDelete,
    broadcastDraftMap,
    adminContactCache,
    adminUserListCache,
    pendingRegistrationData, // NEW
    editSessionByPhone, // NEW
    EditSession,
    editSessionByPhone as editSessionMap,
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
    if (up === 'HAPUS') return '3'; // Support keyword "HAPUS" langsung
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
                            upsertLidPhoneMap({ lid_jid: chatJid, phone_number: senderPhone, push_name: null }).catch(() => { });
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

                // Helper untuk membersihkan input user
                // (Variables normalized, rawTrim are declared later)

                // Jika pesan adalah gambar/video tanpa caption, beritahu user
                if (!rawInput && (mAny?.imageMessage || mAny?.videoMessage)) {
                    await sock.sendMessage(remoteJid, {
                        text: `⚠️ Maaf, saya tidak bisa membaca gambar/foto

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
5049488522223333
3173000011112222
3173888877776666

Dan seterusnya.

Silakan ketik pesan teks atau kirim MENU untuk melihat pilihan.` });
                    continue;
                }

                if (!rawInput) continue;

                // Ambil pengaturan bot dari database
                const botSettings = await getBotSettings();
                const closed = isSystemClosed(receivedAt, botSettings);

                // 🛑 CEK JAM TUTUP (PRIORITAS UTAMA)
                // Jika tutup, langsung tolak (kecuali Admin)
                if (closed && !isAdmin) {
                    const closeMessage = renderCloseMessage(botSettings);
                    await sock.sendMessage(remoteJid, { text: closeMessage });
                    continue; // STOP PROCESSING
                }

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

                            // Kirim pesan selamat datang + MENU UTAMA
                            const welcomeBackMsg = [
                                `✅ *Selamat datang kembali!*`,
                                `Nomor Anda (${phoneFound}) sudah dikenali.`,
                                '',
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                '',
                                MENU_MESSAGE,
                            ].join('\n');
                            await sock.sendMessage(remoteJid, { text: welcomeBackMsg });
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
                const currentLocation = userLocationChoice.get(senderPhone) || 'DHARMAJAYA'; // Default to old style (Dharmajaya) if unknown

                // --- EDIT FLOW HANDLER (PATCH 1 START) ---
                if (currentUserFlow === 'EDIT_PICK_RECORD') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL') {
                        replyText = '✅ Edit dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else {
                        // User input nomor urut
                        const idx = parseInt(normalized);
                        if (isNaN(idx) || idx < 1 || idx > session.recordsToday.length) {
                            replyText = '⚠️ Nomor tidak valid. Ketik sesuai angka di daftar, atau 0 batal.';
                        } else {
                            // Valid Index -> Move to Pick Field
                            const record = session.recordsToday[idx - 1];
                            session.selectedIndex = idx;
                            session.selectedRecordId = record.id;

                            // Determine Type (Dharmajaya vs Pasarjaya)
                            // Logic: if lokasi starts with 'PASARJAYA' OR has tanggal_lahir -> PASARJAYA
                            // Else -> DHARMAJAYA
                            const isPasarjaya = (record.lokasi && record.lokasi.startsWith('PASARJAYA')) || !!record.tanggal_lahir;
                            session.selectedType = isPasarjaya ? 'PASARJAYA' : 'DHARMAJAYA';

                            // Determine Display Location
                            let displayLocation = 'Duri Kosambi'; // Default for Dharmajaya
                            if (isPasarjaya) {
                                if (record.lokasi && record.lokasi.includes('-')) {
                                    displayLocation = record.lokasi.split('-')[1].trim();
                                } else {
                                    displayLocation = 'Pasarjaya';
                                }
                            }

                            editSessionMap.set(senderPhone, session); // update session
                            userFlowByPhone.set(senderPhone, 'EDIT_PICK_FIELD');

                            // Build Menu Fields
                            const isP = session.selectedType === 'PASARJAYA';
                            const fields = [
                                '1️⃣ Nama',
                                '2️⃣ Nomor Kartu',
                                '3️⃣ Nomor KTP (NIK)',
                                '4️⃣ Nomor KK',
                                isP ? '5️⃣ Tanggal Lahir' : '5️⃣ BATAL', // If Dharmajaya, 5 is Batal (or just limit to 4?) -> Plan says 5 is Batal for Dharma
                                isP ? '6️⃣ BATAL' : ''
                            ].filter(Boolean);

                            replyText = [
                                `📝 *EDIT DATA KE-${idx}*`,
                                `👤 Nama: ${record.nama}`,
                                `📍 Lokasi: ${displayLocation}`,
                                '',
                                'Pilih data yang ingin diubah:',
                                ...fields,
                                '',
                                '_Ketik angka pilihanmu._'
                            ].join('\n');
                        }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'EDIT_PICK_FIELD') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else {
                        const isPasarjaya = session.selectedType === 'PASARJAYA';
                        const choice = parseInt(normalized);

                        // Mapping Choice -> Field Key
                        let fieldKey = '';
                        let isCancel = false;

                        if (choice === 1) fieldKey = 'nama';
                        else if (choice === 2) fieldKey = 'no_kjp';
                        else if (choice === 3) fieldKey = 'no_ktp';
                        else if (choice === 4) fieldKey = 'no_kk';
                        else if (choice === 5) {
                            if (isPasarjaya) fieldKey = 'tanggal_lahir';
                            else isCancel = true;
                        }
                        else if (choice === 6 && isPasarjaya) isCancel = true;
                        else if (choice === 0) isCancel = true;
                        else {
                            // Invalid choice
                            replyText = '⚠️ Pilihan salah. Ketik angka menu.';
                        }

                        if (isCancel) {
                            replyText = '✅ Edit dibatalkan.';
                            userFlowByPhone.set(senderPhone, 'NONE');
                            editSessionMap.delete(senderPhone);
                        } else if (fieldKey) {
                            // VALID FIELD SELECTED
                            session.selectedFieldKey = fieldKey;

                            const fieldLabel = {
                                'nama': 'Nama',
                                'no_kjp': 'Nomor Kartu',
                                'no_ktp': 'Nomor KTP',
                                'no_kk': 'Nomor KK',
                                'tanggal_lahir': 'Tanggal Lahir'
                            }[session.selectedFieldKey!] || session.selectedFieldKey!;

                            // UPDATE SESSION
                            editSessionMap.set(senderPhone, session);
                            userFlowByPhone.set(senderPhone, 'EDIT_INPUT_VALUE');

                            replyText = [
                                `📝 *EDIT ${(fieldLabel || 'DATA').toUpperCase()}*`,
                                '',
                                `Silakan ketik nilai baru untuk ${fieldLabel}.`,
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        }
                    }

                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                // PATCH 2: INPUT VALUE & CONFIRMATION
                else if (currentUserFlow === 'EDIT_INPUT_VALUE') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL') {
                        replyText = '✅ Edit dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else {
                        // VALIDASI INPUT NILAI BARU
                        const rawVal = rawTrim;
                        let cleanVal = rawVal;
                        let isValid = true;
                        let errorMsg = '';

                        // Clean Value based on field type
                        if (session.selectedFieldKey === 'nama') {
                            // Validasi Nama: Minimal 3 huruf
                            cleanVal = rawVal.replace(/^\d+[\.\)\s]+\s*/, '') // Hapus nomor urut di depan
                                .replace(/[^\w\s\.\,\-\']/gi, '') // Hapus karakter aneh
                                .trim().toUpperCase();
                            if (cleanVal.length < 3) {
                                isValid = false;
                                errorMsg = '⚠️ Nama terlalu pendek. Minimal 3 huruf.';
                            }
                        } else if (['no_kjp', 'no_ktp', 'no_kk'].includes(session.selectedFieldKey!)) {
                            // Validasi Angka
                            cleanVal = rawVal.replace(/\D/g, ''); // Ambil angka saja
                            const len = cleanVal.length;

                            if (session.selectedFieldKey === 'no_kjp') {
                                if (len < 16 || len > 18) {
                                    isValid = false;
                                    errorMsg = '⚠️ Nomor Kartu harus 16-18 digit.';
                                } else if (!cleanVal.startsWith('504948')) {
                                    isValid = false;
                                    errorMsg = '⚠️ Nomor Kartu harus diawali 504948.';
                                }
                            } else {
                                // KTP / KK
                                if (len !== 16) {
                                    isValid = false;
                                    errorMsg = `⚠️ Nomor ${session.selectedFieldKey === 'no_ktp' ? 'KTP' : 'KK'} harus 16 digit.`;
                                }
                            }
                        } else if (session.selectedFieldKey === 'tanggal_lahir') {
                            // Validasi Tanggal
                            const iso = parseFlexibleDate(rawVal); // returns YYYY-MM-DD or null
                            if (!iso) {
                                isValid = false;
                                errorMsg = '⚠️ Format tanggal salah. Gunakan DD-MM-YYYY (Contoh: 15-05-2005).';
                            } else {
                                cleanVal = iso; // Simpan format ISO untuk display/db (tapi user input DMY)
                            }
                        }

                        if (!isValid) {
                            replyText = `${errorMsg}\n\nSilakan ketik ulang atau 0 untuk batal.`;
                        } else {
                            // VALIDASI LOLOS -> KONFIRMASI
                            session.newValue = cleanVal;
                            editSessionMap.set(senderPhone, session);
                            userFlowByPhone.set(senderPhone, 'EDIT_CONFIRMATION');

                            const fieldLabel = {
                                'nama': 'Nama',
                                'no_kjp': 'Nomor Kartu',
                                'no_ktp': 'Nomor KTP',
                                'no_kk': 'Nomor KK',
                                'tanggal_lahir': 'Tanggal Lahir'
                            }[session.selectedFieldKey!];

                            // Ambil nilai lama untuk display
                            const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                            let oldValue = record ? record[session.selectedFieldKey!] : '(Tidak diketahui)';

                            // Format Tanggal Display
                            if (session.selectedFieldKey === 'tanggal_lahir' && oldValue && oldValue !== '(Tidak diketahui)') {
                                oldValue = oldValue.split('-').reverse().join('-');
                            }
                            let newValueDisplay = session.newValue!;
                            if (session.selectedFieldKey === 'tanggal_lahir') {
                                newValueDisplay = newValueDisplay.split('-').reverse().join('-');
                            }

                            replyText = [
                                '📝 *KONFIRMASI PERUBAHAN*',
                                '',
                                `Field: *${fieldLabel}*`,
                                '',
                                `🔻 *Data Lama:*`,
                                `${oldValue}`,
                                '',
                                `🔺 *Data Baru:*`,
                                `${newValueDisplay}`,
                                '',
                                'Apakah Anda yakin ingin menyimpan perubahan ini?',
                                '',
                                'Ketik *1* atau *OK* untuk SIMPAN',
                                'Ketik *0* atau *BATAL* untuk membatalkan'
                            ].join('\n');
                        }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'EDIT_CONFIRMATION') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL' || normalized === 'TIDAK') {
                        replyText = '✅ Perubahan dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else if (normalized === '1' || normalized === 'OK' || normalized === 'YA' || normalized === 'SIAP') {
                        // EKSEKUSI SIMPAN KE DB
                        const { success, error } = await updateDailyDataField(
                            session.selectedRecordId!,
                            session.selectedFieldKey!,
                            session.newValue!
                        );

                        // Ambil fieldLabel untuk reply
                        const fieldLabel = {
                            'nama': 'Nama',
                            'no_kjp': 'Nomor Kartu',
                            'no_ktp': 'Nomor KTP',
                            'no_kk': 'Nomor KK',
                            'tanggal_lahir': 'Tanggal Lahir'
                        }[session.selectedFieldKey!] || session.selectedFieldKey!;

                        // Ambil oldValue dari session records untuk reply
                        const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                        let oldValue = record ? record[session.selectedFieldKey!] : '(Tidak diketahui)';
                        if (session.selectedFieldKey === 'tanggal_lahir' && oldValue && oldValue !== '(Tidak diketahui)') {
                            oldValue = oldValue.split('-').reverse().join('-');
                        }

                        // Ambil newValueDisplay dari session untuk reply
                        let newValueDisplay = session.newValue!;
                        if (session.selectedFieldKey === 'tanggal_lahir') {
                            newValueDisplay = newValueDisplay.split('-').reverse().join('-');
                        }

                        if (success) {
                            replyText = [
                                '✨ *DATA BERHASIL DISIMPAN!* ✨',
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                `📂 Field: *${(fieldLabel || '').toUpperCase()}*`,
                                `🔻 Lama: ${oldValue}`,
                                `✅ Baru: *${newValueDisplay}*`,
                                '',
                                '👇 *MENU LAINNYA*',
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                '🔹 Ketik *CEK*   → 🧐 Lihat Data',
                                '🔹 Ketik *EDIT*  → Ganti Data Salah',
                                '🔹 Ketik *HAPUS* → 🗑️ Hapus Data',
                                '🔹 Ketik *MENU*  → 🏠 Menu Utama'
                            ].join('\n');
                        } else {
                            console.error('Gagal update data:', error);
                            replyText = '❌ Gagal menyimpan perubahan. Silakan coba lagi nanti.';
                        }

                        // Bersihkan sesi
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else {
                        replyText = '⚠️ Ketik *1* untuk SIMPAN atau *0* untuk BATAL.';
                    }

                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                // --- END PATCH 2 ---

                // ===== STRICT LOGIC PENDAFTARAN =====

                // 1. Apakah ini terlihat seperti data pendaftaran (minimal 4 baris)?
                const dataLines = parseRawMessageToLines(messageText);

                // DEBUG: Trace Incoming Message & State
                const currentSpecificLoc = userSpecificLocationChoice.get(senderPhone);
                console.log(`[DEBUG] MSG from ${senderPhone} | Flow: ${currentUserFlow} | LocChoice: ${currentLocation} | SpecificLoc: ${currentSpecificLoc} | MsgShort: ${messageText.slice(0, 20).replace(/\n/g, ' ')}...`);

                // Basic check: Minimal 4 baris
                const potentialData = dataLines.length >= 4;

                // Skip validation block jika user sedang dalam flow yang butuh memilih sub-lokasi
                // Biar handler flow yang proses data-nya
                const skipDataValidation = (currentUserFlow as string) === 'SELECT_PASARJAYA_SUB' || (currentUserFlow as string) === 'INPUT_MANUAL_LOCATION';

                if (potentialData && !skipDataValidation) {
                    const existingLocation = userLocationChoice.get(senderPhone);


                    // --- ATURAN 1: WAJIB PILIH LOKASI DULU ---
                    // EXCEPTION: Jika user sedang dalam flow SELECT_PASARJAYA_SUB atau INPUT_MANUAL_LOCATION,
                    // biarkan handler flow yang proses (jangan intercept di sini)
                    if (!existingLocation && currentUserFlow !== 'SELECT_PASARJAYA_SUB' && currentUserFlow !== 'INPUT_MANUAL_LOCATION') {
                        // SIMPAN DATA SEMENTARA
                        pendingRegistrationData.set(senderPhone, messageText);

                        // Minta pilih lokasi (Format Lama) tapi nanti 1 akan trigger menu baru
                        await sock.sendMessage(remoteJid, {
                            text: `⚠️ *Mohon Pilih Lokasi Dulu*\n\nData Anda sepertinya valid, tapi saya perlu tahu Anda mau ambil sembako di mana?\n\nKetik *1* untuk Pasarjaya\nKetik *2* untuk Dharmajaya Duri Kosambi`
                        });
                        userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                        return; // Selesai
                    }

                    // --- ATURAN 2: VALIDASI FORMAT BERDASARKAN LOKASI ---
                    let isValidFormat = false;
                    let detectedFormat = existingLocation; // 'PASARJAYA' or 'DHARMAJAYA'
                    let rejectionReason = '';

                    // const looksLikeDatePatternCheck = ... (REMOVED: logic moved to looksLikeDate())

                    if (existingLocation === 'PASARJAYA') {
                        // WAJIB 5 BARIS per orang
                        // 1. Cek kelipatan 5
                        if (dataLines.length % 5 !== 0) {
                            isValidFormat = false;
                            // Cek apakah mungkin dia kirim 4 baris (kasus salah format umum)
                            if (dataLines.length % 4 === 0) {
                                rejectionReason = [
                                    '❌ *FORMAT TIDAK COCOK*',
                                    '',
                                    'Anda sedang di mode: *PASARJAYA (Wajib 5 Baris)*',
                                    'Tapi data yang dikirim formatnya *4 Baris*.',
                                    '',
                                    '💡 *SOLUSI:*',
                                    '1. Jika ingin ganti lokasi, ketik *0* (Batal), lalu pilih lokasi ulang.',
                                    '2. Jika tetap di *Pasarjaya*, lengkapi baris ke-5 dengan *Tanggal Lahir*.'
                                ].join('\n');
                            } else {
                                rejectionReason = [
                                    '❌ *JUMLAH BARIS SALAH*',
                                    'Untuk *Pasarjaya*, format harus 5 baris per orang:',
                                    '1. Nama',
                                    '2. Kartu',
                                    '3. KTP',
                                    '4. KK',
                                    '5. Tanggal Lahir',
                                    '',
                                    'Silakan periksa kembali ketikan Anda.'
                                ].join('\n');
                            }
                        } else {
                            // Cek apakah baris ke-5 adalah tanggal?
                            let allDatesValid = true;
                            for (let i = 4; i < dataLines.length; i += 5) {
                                // Use shared robust date checker
                                if (!looksLikeDate(dataLines[i])) {
                                    allDatesValid = false;
                                    console.log(`[DEBUG] Date validation failed for: ${dataLines[i]}`);
                                    break;
                                }
                            }
                            if (!allDatesValid) {
                                isValidFormat = false;
                                rejectionReason = '❌ *Format Tanggal Salah*\nBaris ke-5 harus berupa Tanggal Lahir (Contoh: 23-04-2020).';
                            } else {
                                isValidFormat = true;
                            }
                        }
                    } else if (existingLocation === 'DHARMAJAYA') {
                        // WAJIB 4 BARIS per orang
                        if (dataLines.length % 4 !== 0) {
                            isValidFormat = false;
                            if (dataLines.length % 5 === 0) {
                                rejectionReason = [
                                    '❌ *FORMAT TIDAK COCOK*',
                                    '',
                                    'Anda sedang di mode: *DHARMAJAYA (Wajib 4 Baris)*',
                                    'Tapi data yang dikirim formatnya *5 Baris* (ada Tanggal Lahir?).',
                                    '',
                                    '💡 *SOLUSI:*',
                                    '1. Jika ingin ganti lokasi, ketik *0* (Batal), lalu pilih lokasi ulang.',
                                    '2. Jika tetap di *Dharmajaya*, hapus baris tanggal lahirnya.'
                                ].join('\n');
                            } else {
                                rejectionReason = [
                                    '❌ *JUMLAH BARIS SALAH*',
                                    'Untuk *Dharmajaya*, format harus 4 baris per orang:',
                                    '1. Nama',
                                    '2. Kartu',
                                    '3. KTP',
                                    '4. KK',
                                    '',
                                    'Silakan periksa kembali ketikan Anda.'
                                ].join('\n');
                            }
                        } else {
                            isValidFormat = true;
                        }
                    }

                    if (isValidFormat) {
                        // PROSES SAVE DATA

                        // Reset flow state agar tidak mengganggu
                        userFlowByPhone.set(senderPhone, 'NONE');

                        // Ambil lokasi spesifik dari session (jika ada)
                        const storedSpecificLocation = userSpecificLocationChoice.get(senderPhone);

                        const logJson = await processRawMessageToLogJson({
                            text: messageText,
                            senderPhone,
                            messageId: msg.key.id,
                            receivedAt,
                            tanggal: tanggalWib,
                            processingDayKey,
                            locationContext: existingLocation, // MUST MATCH existingLocation
                            specificLocation: storedSpecificLocation // Pass stored specific location
                        });

                        // INJECT SENDER NAME
                        logJson.sender_name = existingName || undefined;

                        if (logJson.stats.total_blocks > 0 || (logJson.failed_remainder_lines && logJson.failed_remainder_lines.length > 0)) {
                            await saveLogAndOkItems(logJson, messageText);

                            // Hitung total data hari ini SETELAH data disimpan
                            // Hitung total data hari ini SETELAH data disimpan
                            const todayRecap = await getTodayRecapForSender(senderPhone, processingDayKey);
                            const replyDataText = buildReplyForNewData(logJson, todayRecap.validCount, existingLocation, todayRecap.validItems);
                            await sock.sendMessage(remoteJid, { text: replyDataText });
                            console.log(`📤 Data pendaftaran (${existingLocation}) berhasil diproses untuk ${senderPhone}`);
                        } else {
                            await sock.sendMessage(remoteJid, {
                                text: `⚠️ *Gagal Membaca Data*\nPastikan format penulisan sudah benar sesuai contoh.`
                            });
                        }
                        continue;
                    } else {
                        // REJECT DENGAN PESAN ERROR SPESIFIK
                        await sock.sendMessage(remoteJid, {
                            text: rejectionReason || '⚠️ *Format Data Tidak Sesuai Lokasi*'
                        });
                        continue;
                    }
                }

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
                    const input = normalized;

                    if (input === '0') {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        replyText = '✅ Penghapusan data dibatalkan.';
                    } else if (input === 'ALL' || input === 'SEMUA') {
                        // Hapus SEMUA
                        const res = await deleteAllDailyDataForSender(senderPhone, processingDayKey);
                        if (res.success) {
                            const namesStr = res.deletedNames && res.deletedNames.length > 0
                                ? `: *${res.deletedNames.join(', ')}*`
                                : '';
                            replyText = `✅ Sukses menghapus *${res.deletedCount}* data (SEMUA)${namesStr}.`;
                            userFlowByPhone.set(senderPhone, 'NONE');
                        } else {
                            replyText = '❌ Gagal menghapus data. Silakan coba lagi.';
                        }
                    } else {
                        // Coba parse angka (bisa 1 atau 1,2,3)
                        // Split by comma or space
                        const parts = input.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));

                        if (parts.length === 0) {
                            replyText = '⚠️ Input tidak valid. \nKetik nomor urut (contoh: *1* atau *1,2*) atau *ALL* untuk hapus semua. Ketik *0* untuk batal.';
                        } else {
                            const indices = parts.map(Number);
                            const res = await deleteDailyDataByIndices(senderPhone, processingDayKey, indices);
                            if (res.success && res.deletedCount > 0) {
                                const namesStr = res.deletedNames && res.deletedNames.length > 0
                                    ? `: *${res.deletedNames.join(', ')}*`
                                    : '';
                                replyText = `✅ Sukses menghapus *${res.deletedCount}* data${namesStr}.`;
                                userFlowByPhone.set(senderPhone, 'NONE');

                                // Cek sisa data
                                const { validCount } = await getTodayRecapForSender(senderPhone, processingDayKey);
                                if (validCount > 0) {
                                    replyText += `\n\nSisa data: ${validCount}`;
                                }
                            } else {
                                replyText = '❌ Gagal menghapus. Pastikan nomor urut benar.';
                            }
                        }
                    }

                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'SELECT_LOCATION') {
                    // Logic Unified: Pilihan 1 -> Menu Pasarjaya, Pilihan 2 -> Dharmajaya (Auto Process Pending)
                    if (normalized === '1') {
                        // CEK VALIDASI AWAL: PASARJAYA WAJIB 5 BARIS
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        let rejectPasarjaya = false;
                        if (pendingData) {
                            const lines = parseRawMessageToLines(pendingData);
                            // Jika bukan kelipatan 5 (dan bukan 0), tolak.
                            if (lines.length > 0 && lines.length % 5 !== 0) {
                                rejectPasarjaya = true;
                                replyText = [
                                    '⚠️ *DATA TERTOLAK (SALAH FORMAT)*',
                                    '',
                                    'Anda memilih: *1. PASARJAYA*',
                                    'Syarat: *Wajib 5 Baris* (Nama, Kartu, KTP, KK, Tanggal Lahir).',
                                    '',
                                    `Data Anda: *${lines.length} baris* (Terdeteksi format Dharmajaya/Salah).`,
                                    '',
                                    '💡 *SOLUSI:*',
                                    '• Jika ingin ke Dharmajaya, ketik *2*.',
                                    '• Jika tetap Pasarjaya, mohon perbaiki data Anda (tambah Tanggal Lahir) dan kirim ulang.',
                                    '',
                                    '_Ketik 0 untuk batal._'
                                ].join('\n');
                            }
                        }

                        if (!rejectPasarjaya) {
                            // MENU SUB-LOKASI PASARJAYA
                            replyText = MENU_PASARJAYA_LOCATIONS;
                            userFlowByPhone.set(senderPhone, 'SELECT_PASARJAYA_SUB');
                        }
                    } else if (normalized === '2') {
                        // CEK VALIDASI AWAL: DHARMAJAYA WAJIB 4 BARIS
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        let rejectDharmajaya = false;

                        if (pendingData) {
                            const lines = parseRawMessageToLines(pendingData);
                            // Jika kelipatan 5 (Pasarjaya) tapi bukan kelipatan 4 -> Tolak
                            if (lines.length > 0 && lines.length % 5 === 0 && lines.length % 4 !== 0) {
                                rejectDharmajaya = true;
                                replyText = [
                                    '⚠️ *DATA TERTOLAK (SALAH FORMAT)*',
                                    '',
                                    'Anda memilih: *2. DHARMAJAYA*',
                                    'Syarat: *Wajib 4 Baris* (Nama, Kartu, KTP, KK).',
                                    '',
                                    `Data Anda: *${lines.length} baris* (Terdeteksi format Pasarjaya / ada Tanggal Lahir).`,
                                    '',
                                    '💡 *SOLUSI:*',
                                    '• Jika ingin ke Pasarjaya, ketik *1*.',
                                    '• Jika tetap Dharmajaya, mohon hapus Tanggal Lahir dan kirim ulang.',
                                    '',
                                    '_Ketik 0 untuk batal._'
                                ].join('\n');
                            }
                        }

                        if (!rejectDharmajaya) {
                            // DHARMAJAYA (AUTO)
                            userLocationChoice.set(senderPhone, 'DHARMAJAYA');
                        }

                        // Cek apakah ada data pending yang menunggu diproses?
                        // (Hanya lanjut jika tidak direject)
                        if (!rejectDharmajaya && pendingData) {
                            // PROSES DATA PENDING (DHARMAJAYA: Langsung pakai, tanpa ubah nama)
                            // Kita "pura-pura" user mengirim pesan data itu sekarang
                            // Set flow to NONE agar tidak loop
                            userFlowByPhone.set(senderPhone, 'NONE');
                            // Hapus pending
                            pendingRegistrationData.delete(senderPhone);

                            // Call process logic RECURSIVELY (simulate message)
                            // Tapi karena kita di dalam loop, kita bisa set `messageText` = pendingData dan `jump`?
                            // Solusi aman: Kita panggil logic parse & save di sini langsung (copy logic sedikit dr bawah)
                            // ATAU: Kita inject messageText baru dan biarkan logic bawah jalan? -> Susah.
                            // BEST PRACTICE: Kita kirim pesan sukses manual di sini jika berhasil.
                            // TAPI Validasi line count dll ada di bawah.
                            // TRY: Kita modify `messageText` variable dan biarkan loop continue ke bawah? 
                            // -> TIDAK BISA, karena `messageText` const, dan logic pendaftaran ada di `if (potentialData)`.
                            // SOLUSI: Kita reply dulu "Lokasi terpilih", lalu minta user kirim ulang? NO.
                            // SOLUSI PRO: Panggil logic validasi & save yang di-extract jadi fungsi? Atau copy-paste logic core.

                            // UNTUK SIMPLIFIKASI DAN KEAMANAN, KITA PAKAI CARA "INJECT" SEDERHANA:
                            // Kita kirim pesan ke user "Sedang memproses..."
                            await sock.sendMessage(remoteJid, { text: '🔄 Memproses data untuk Dharmajaya...' });

                            // Re-run logic pendaftaran dengan messageText = pendingData & existingLocation = DHARMAJAYA
                            // Hacky but works without refactoring whole file:
                            // Kita set userLocationChoice sudah 'DHARMAJAYA' (done above).
                            // Kita panggil ulang handler dengan teks pending. 
                            // TAPI kita butuh function terpisah.
                            // ---
                            // ALTERNATIF MUDAH: Minta kirim ulang (JANGAN). User marah.
                            // ---
                            // ALTERNATIF BENAR: Refactor logic process ke function `handleRegistrationData`.
                            // TAPI berhubung instruksi cuma boleh edit file, kita buat blok process di sini.

                            // --- BLOK PROSES DATA PENDING ---
                            const lines = parseRawMessageToLines(pendingData);
                            const minLines = 4;
                            if (lines.length >= minLines) { // Harusnya valid
                                const logJson = await processRawMessageToLogJson({
                                    text: pendingData,
                                    senderPhone,
                                    messageId: msg.key.id,
                                    receivedAt,
                                    tanggal: tanggalWib,
                                    processingDayKey,
                                    locationContext: 'DHARMAJAYA'
                                });
                                logJson.sender_name = existingName || undefined;

                                if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                    await saveLogAndOkItems(logJson, pendingData);
                                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);
                                    replyText = buildReplyForNewData(logJson, validCount, 'DHARMAJAYA', validItems);
                                    userFlowByPhone.set(senderPhone, 'NONE'); // Reset flow
                                    // replyText will be sent below
                                } else {
                                    replyText = '❌ *Data Dharmajaya Gagal Proses*\nPastikan format 4 baris per orang.';
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                }
                            } else {
                                replyText = '❌ *Data Tidak Lengkap*\nMinimal 4 baris.';
                                userFlowByPhone.set(senderPhone, 'NONE');
                            }
                            // --- END BLOK ---

                        } else {
                            // User pilih lokasi tapi belum pernah kirim data -> Kirim Format Panduan
                            userFlowByPhone.set(senderPhone, 'NONE');
                            replyText = FORMAT_DAFTAR_DHARMAJAYA;
                        }
                    } else if (normalized === '0') {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        pendingRegistrationData.delete(senderPhone);
                        replyText = '✅ Pendaftaran dibatalkan.';
                    } else {
                        replyText = '⚠️ Pilih 1 (Pasarjaya) atau 2 (Dharmajaya). Ketik 0 untuk batal.';
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'SELECT_PASARJAYA_SUB') {
                    // HANDLER MENU PASARJAYA (1-5)
                    if (normalized === '0') {
                        // Back to None
                        userFlowByPhone.set(senderPhone, 'NONE');
                        pendingRegistrationData.delete(senderPhone);
                        replyText = '✅ Batal pilih lokasi.';
                    } else if (normalized === '5') {
                        // MANUAL INPUT
                        userFlowByPhone.set(senderPhone, 'INPUT_MANUAL_LOCATION');
                        replyText = '📝 Silakan ketik nama lokasinya saja (Contoh: *Pasar Rumput*):';
                    } else if (PASARJAYA_MAPPING[normalized]) {
                        // PILIHAN 1-4 (VALID)
                        const lokasiName = PASARJAYA_MAPPING[normalized];
                        userLocationChoice.set(senderPhone, 'PASARJAYA');
                        userSpecificLocationChoice.set(senderPhone, `PASARJAYA - ${lokasiName}`); // STORE SPECIFIC LOCATION
                        console.log(`[DEBUG] SET Specific Location for ${senderPhone}: PASARJAYA - ${lokasiName}`);

                        // CEK PENDING DATA
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        if (pendingData) {
                            await sock.sendMessage(remoteJid, { text: `🔄 Memproses data untuk Pasarjaya (${lokasiName})...` });

                            // PROSES DATA PENDING + PASS SPECIFIC LOCATION
                            // Logic Baru: Jangan inject text, tapi pass parameter specificLocation

                            const logJson = await processRawMessageToLogJson({
                                text: pendingData,
                                senderPhone,
                                messageId: msg.key.id,
                                receivedAt,
                                tanggal: tanggalWib,
                                processingDayKey,
                                locationContext: 'PASARJAYA',
                                specificLocation: `PASARJAYA - ${lokasiName}` // PASS SPECIFIC LOCATION HERE
                            });
                            logJson.sender_name = existingName || undefined;

                            // Logic Save & Reply (Copied for safety)
                            if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                await saveLogAndOkItems(logJson, pendingData);
                                const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);
                                replyText = buildReplyForNewData(logJson, validCount, 'PASARJAYA', validItems);
                                userFlowByPhone.set(senderPhone, 'NONE');
                                pendingRegistrationData.delete(senderPhone);
                            } else {
                                // Gagal (Mungkin kurang tanggal lahir / baris)
                                replyText = '❌ *Data Pasarjaya Gagal Proses*\nPastikan format 5 baris (Nama, Kartu, KTP, KK, Tgl Lahir).\nDan pastikan Tanggal Lahir benar.';
                                userFlowByPhone.set(senderPhone, 'NONE');
                                // Jangan delete pending? Biar user bisa coba lagi?
                                // Ah delete saja biar bersih, user kirim ulang yang benar.
                                pendingRegistrationData.delete(senderPhone);
                            }
                        } else {
                            // User pilih lokasi manual (tanpa pending data) -> Kirim Format Panduan
                            userFlowByPhone.set(senderPhone, 'NONE');
                            replyText = FORMAT_DAFTAR_PASARJAYA;
                        }
                    } else {
                        // Cek apakah user kirim data langsung (5+ baris) bukan pilihan angka
                        const inputLines = parseRawMessageToLines(messageText);
                        if (inputLines.length >= 5 && inputLines.length % 5 === 0) {
                            // User kirim data Pasarjaya langsung, simpan pending dan tanya sub-lokasi lagi
                            pendingRegistrationData.set(senderPhone, messageText);
                            replyText = [
                                '📍 *PILIH LOKASI PENGAMBILAN DULU*',
                                '',
                                '✅ Data Anda sudah tersimpan sementara.',
                                'Silakan pilih lokasi pengambilannya:',
                                '',
                                '1. 🏭 Jakgrosir Kedoya',
                                '2. 🏙️ Gerai Rusun Pesakih',
                                '3. 🏪 Mini DC Kec. Cengkareng',
                                '4. 🛒 Jakmart Bambu Larangan',
                                '5. 📝 Lokasi Lain...',
                                '',
                                '_Ketik angka pilihanmu! (1-5)_',
                                '_(Ketik 0 untuk batal)_'
                            ].join('\n');
                            // Flow tetap SELECT_PASARJAYA_SUB
                        } else {
                            replyText = '⚠️ Pilihan salah. Ketik 1-5, atau 0 batal.';
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'INPUT_MANUAL_LOCATION') {
                    // HANDLER INPUT LOKASI MANUAL
                    const lokasiName = rawTrim; // Ambil input user sebagai nama lokasi
                    // Validasi minimal panjang
                    if (lokasiName.length < 3) {
                        replyText = '⚠️ Nama lokasi terlalu pendek. Coba lagi atau ketik 0 batal.';
                        if (rawTrim === '0') {
                            userFlowByPhone.set(senderPhone, 'NONE');
                            pendingRegistrationData.delete(senderPhone);
                            replyText = '✅ Batal.';
                        }
                    } else {
                        userLocationChoice.set(senderPhone, 'PASARJAYA');
                        userSpecificLocationChoice.set(senderPhone, `PASARJAYA - ${lokasiName}`); // STORE SPECIFIC LOCATION
                        console.log(`[DEBUG] SET Specific Location (Manual) for ${senderPhone}: PASARJAYA - ${lokasiName}`);

                        // CEK PENDING DATA (Copy logic from above/Shared Logic ideally)
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        if (pendingData) {
                            await sock.sendMessage(remoteJid, { text: `🔄 Memproses data untuk Pasarjaya (${lokasiName})...` });

                            const logJson = await processRawMessageToLogJson({
                                text: pendingData,
                                senderPhone,
                                messageId: msg.key.id,
                                receivedAt,
                                tanggal: tanggalWib,
                                processingDayKey,
                                locationContext: 'PASARJAYA',
                                specificLocation: `PASARJAYA - ${lokasiName}` // PASS SPECIFIC LOCATION HERE
                            });
                            logJson.sender_name = existingName || undefined;

                            if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                await saveLogAndOkItems(logJson, pendingData);
                                const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);
                                replyText = buildReplyForNewData(logJson, validCount, 'PASARJAYA', validItems);
                                userFlowByPhone.set(senderPhone, 'NONE');
                                pendingRegistrationData.delete(senderPhone);
                            } else {
                                replyText = '❌ *Data Pasarjaya Gagal Proses*\nPastikan format 5 baris (Nama, Kartu, KTP, KK, Tgl Lahir).\nDan pastikan Tanggal Lahir benar.';
                                userFlowByPhone.set(senderPhone, 'NONE');
                                pendingRegistrationData.delete(senderPhone);
                            }
                        } else {
                            // User pilih lokasi manual (tanpa pending data) -> Kirim Format Panduan tapi bingung mau format apa
                            // Harusnya format daftar pasarjaya biasa
                            userFlowByPhone.set(senderPhone, 'NONE');
                            replyText = FORMAT_DAFTAR_PASARJAYA;
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
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
                                '',
                                'Atau gunakan menu *3. HAPUS* untuk memilih dari daftar.'
                            ].join('\n');
                        }
                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }

                // Prioritas Cek Admin Flow agar tidak tertabrak menu user
                const currentAdminFlow = adminFlowByPhone.get(senderPhone) ?? 'NONE';

                // MENU HANDLER: 3 (HAPUS)
                // Kita pindahkan ke sini agar tidak "kalah" sama logic lain
                // FIX: Tambah syarat currentAdminFlow === 'NONE'
                if (normalized === '3' && currentUserFlow === 'NONE' && currentAdminFlow === 'NONE') {
                    // 1. Ambil data hari ini untuk ditampilkan
                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                    if (validCount === 0) {
                        replyText = '⚠️ *DATA KOSONG*\n\nBelum ada data pendaftaran hari ini yang bisa dihapus.';
                    } else {
                        // Build List
                        const listRows: string[] = [];
                        listRows.push('🗑️ *HAPUS DATA PENDAFTARAN*');
                        listRows.push('');
                        listRows.push('📋 Pilih data yang ingin dihapus:');
                        listRows.push('');

                        validItems.forEach((item, idx) => {
                            // Format: 1. AGUS
                            listRows.push(`${idx + 1}. ${item.nama.toUpperCase()}`);
                        });

                        listRows.push('');
                        listRows.push('👇 *Cara hapus:*');
                        listRows.push('• Ketik *1* untuk hapus satu data');
                        listRows.push('• Ketik *1,2,3* untuk hapus beberapa sekaligus');
                        listRows.push('• Ketik *ALL* untuk hapus semua data');
                        listRows.push('• Ketik *0* untuk batal');
                        listRows.push('');
                        listRows.push('_Contoh: Ketik 2 untuk hapus data nomor 2_');

                        replyText = listRows.join('\n');
                        userFlowByPhone.set(senderPhone, 'DELETE_DATA');
                    }

                    await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                // --- MENU ADMIN ---
                const dmyExample = processingDayKey.split('-').reverse().join('-');

                const getPastKey = (daysBack: number) => shiftIsoDate(processingDayKey, -daysBack);


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
                        // MENU ADMIN BARU:
                        // 1 = Hapus Data User (per orang)
                        // 2 = Rekap Hari Ini
                        // 3 = Rekap Tanggal Tertentu
                        // 4 = Rekap Rentang Tanggal
                        // 5 = List Semua Kontak
                        // 6 = Edit Kontak
                        // 7 = Hapus Kontak
                        // 8 = Broadcast Informasi
                        // 9 = Statistik Dashboard
                        // 10 = Cari Data
                        // 11 = Log Aktivitas
                        // 12 = Export Data (TXT)

                        if (normalized === '1') {
                            // HAPUS DATA USER - Tampilkan daftar user yang kirim data hari ini
                            adminFlowByPhone.set(senderPhone, 'ADMIN_DELETE_SELECT_USER');
                            const recap = await getGlobalRecap(processingDayKey, undefined, lookupName);

                            // Ambil daftar user unik yang kirim data hari ini
                            const { data: users } = await supabase
                                .from('data_harian')
                                .select('sender_phone, sender_name')
                                .eq('processing_day_key', processingDayKey)
                                .order('sender_phone');

                            if (!users || users.length === 0) {
                                replyText = '📂 Belum ada data hari ini.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                // Group by sender_phone
                                const userMap = new Map<string, { name: string; count: number }>();
                                users.forEach((u: any) => {
                                    const existing = userMap.get(u.sender_phone);
                                    if (existing) {
                                        existing.count++;
                                    } else {
                                        userMap.set(u.sender_phone, {
                                            name: u.sender_name || getRegisteredUserNameSync(u.sender_phone) || u.sender_phone,
                                            count: 1
                                        });
                                    }
                                });

                                // Cache untuk digunakan di flow berikutnya
                                const userList = Array.from(userMap.entries()).map(([phone, info]) => ({
                                    phone,
                                    name: info.name,
                                    count: info.count
                                }));
                                adminUserListCache.set(senderPhone, userList);

                                let msg = '🗑️ *HAPUS DATA USER*\n\n';
                                msg += `📅 Tanggal: ${dmyExample}\n\n`;
                                msg += 'Pilih user yang datanya ingin dihapus:\n\n';
                                userList.forEach((u, i) => {
                                    msg += `${i + 1}. ${u.name} (${u.count} data)\n`;
                                });
                                msg += '\n👇 Ketik nomor urut user.\n_Ketik 0 untuk batal._';
                                replyText = msg;
                            }
                        }
                        else if (normalized === '2') {
                            // Rekap Hari Ini
                            replyText = await getGlobalRecap(processingDayKey, undefined, lookupName);
                        }
                        else if (normalized === '3') {
                            // Rekap Tanggal Tertentu
                            adminFlowByPhone.set(senderPhone, 'ASK_DATE');
                            replyText = ['📅 *REKAP TANGGAL*', '', `Contoh: *${dmyExample}*`, '', '_Ketik 0 untuk kembali._'].join('\n');
                        }
                        else if (normalized === '4') {
                            // Rekap Rentang Tanggal
                            adminFlowByPhone.set(senderPhone, 'ASK_RANGE');
                            replyText = ['📅 *REKAP RENTANG*', '', `Contoh: *01-01-2026 ${dmyExample}*`, '', '_Ketik 0 untuk kembali._'].join('\n');
                        }
                        else if (normalized === '5') {
                            // List Semua Kontak (langsung tampilkan)
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
                        }
                        else if (normalized === '6') {
                            // Edit Kontak
                            adminFlowByPhone.set(senderPhone, 'EDIT_CONTACT');
                            replyText = ['📝 *EDIT KONTAK*', 'Ketik: NamaBaru NomorHP', 'Contoh: BudiRevisi 0812345'].join('\n');
                        }
                        else if (normalized === '7') {
                            // Hapus Kontak
                            adminFlowByPhone.set(senderPhone, 'DELETE_CONTACT');
                            const allContacts = await getAllLidPhoneMap();

                            adminContactCache.set(senderPhone, allContacts);

                            if (allContacts.length === 0) {
                                replyText = '📂 Tidak ada kontak untuk dihapus.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                let msg = '🗑️ *HAPUS KONTAK*\n\n';
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
                        }
                        else if (normalized === '8') {
                            // Broadcast Informasi
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
                        }
                        else if (normalized === '9') {
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
                        } else if (normalized === '10') {
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
                        } else if (normalized === '11') {
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
                        } else if (normalized === '12') {
                            // FEATURE: EXPORT DATA (TXT only) - Default hari ini, opsi tanggal lain
                            adminFlowByPhone.set(senderPhone, 'EXPORT_SELECT_DATE');
                            replyText = [
                                '📤 *EXPORT DATA*',
                                '',
                                `📅 Default: Hari Ini (${dmyExample})`,
                                '',
                                '1️⃣ Export Hari Ini',
                                '2️⃣ Export Tanggal Lain',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '13') {
                            // FEATURE: ATUR JAM TUTUP
                            const currentSettings = await getBotSettings();
                            const currentTimeStr = formatCloseTimeString(currentSettings);
                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TIME_MENU');

                            replyText = [
                                '⏰ *ATUR JAM TUTUP BOT*',
                                '',
                                `📌 Saat ini tutup jam: *${currentTimeStr}*`,
                                '',
                                'Pilih metode pengaturan:',
                                '1️⃣ Input Manual (Harian)',
                                '2️⃣ Tutup Sekarang (Darurat)',
                                '3️⃣ Tutup Jangka Panjang (Libur)',
                                '4️⃣ Buka Sekarang (Force Open)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '14') {
                            // FEATURE: EDIT TEMPLATE PESAN TUTUP (NEW FLOW)
                            const currentSettings = await getBotSettings();
                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_MSG_MENU');
                            replyText = [
                                '📝 *EDIT TEMPLATE PESAN TUTUP*',
                                '',
                                'Pilih template:',
                                '1️⃣ Gunakan Template Standar (Maintenance & Rekapitulasi)',
                                '2️⃣ Custom (Edit Sendiri)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
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
                    } else if (currentAdminFlow === 'ADMIN_DELETE_SELECT_USER') {
                        // Admin memilih user mana yang datanya akan dihapus
                        const choice = parseInt(normalized);
                        const userList = adminUserListCache.get(senderPhone);

                        if (isNaN(choice) || choice < 0) {
                            replyText = '⚠️ Ketik nomor urut user. Ketik 0 untuk batal.';
                        } else if (choice === 0) {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            adminUserListCache.delete(senderPhone);
                            replyText = '✅ Dibatalkan.';
                        } else if (!userList || choice > userList.length) {
                            replyText = '⚠️ Nomor urut tidak valid.';
                        } else {
                            const selectedUser = userList[choice - 1];
                            // Simpan user yg dipilih dan tampilkan datanya
                            adminUserListCache.set(senderPhone + '_selected', [selectedUser]);

                            // Ambil data detail user tersebut (LENGKAP)
                            const { data: userData } = await supabase
                                .from('data_harian')
                                .select('id, nama, no_kjp, no_ktp, no_kk')
                                .eq('processing_day_key', processingDayKey)
                                .eq('sender_phone', selectedUser.phone)
                                .order('received_at', { ascending: true });

                            if (!userData || userData.length === 0) {
                                replyText = '❌ Data user tidak ditemukan.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                // Cache data untuk delete
                                adminContactCache.set(senderPhone + '_data', userData.map((d: any) => ({
                                    phone_number: String(d.id),
                                    push_name: d.nama
                                })));

                                let msg = `🗑️ *DATA MILIK: ${selectedUser.name}*\n`;
                                msg += `📅 Tanggal: ${dmyExample}\n\n`;
                                userData.forEach((d: any, i: number) => {
                                    msg += `┌── ${i + 1}. *${d.nama}*\n`;
                                    msg += `│   💳 Kartu: ${d.no_kjp}\n`;
                                    msg += `│   🪪 KTP  : ${d.no_ktp}\n`;
                                    msg += `└── 🏠 KK   : ${d.no_kk}\n\n`;
                                });
                                msg += '👇 Ketik nomor data yang mau dihapus.\n';
                                msg += 'Contoh: *1* atau *1,3,5*\n\n';
                                msg += '_Ketik 0 untuk batal._';
                                replyText = msg;
                                adminFlowByPhone.set(senderPhone, 'ADMIN_DELETE_USER_DATA');
                            }
                        }
                    } else if (currentAdminFlow === 'ADMIN_DELETE_USER_DATA') {
                        // Admin memilih data mana yang akan dihapus
                        if (normalized === '0') {
                            replyText = '✅ Penghapusan dibatalkan.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            adminContactCache.delete(senderPhone + '_data');
                        } else {
                            const parts = rawTrim.split(/[,\s]+/);
                            const indices = parts.map((p: string) => parseInt(p.trim())).filter((n: number) => !isNaN(n) && n > 0);

                            if (indices.length === 0) {
                                replyText = '⚠️ Ketik nomor urut data. Contoh: 1, 2, 3. Ketik 0 untuk batal.';
                            } else {
                                const dataList = adminContactCache.get(senderPhone + '_data');

                                if (!dataList || dataList.length === 0) {
                                    replyText = '❌ Cache data hilang. Ulangi dari menu admin.';
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                } else {
                                    let successCount = 0;
                                    const deletedNames: string[] = [];

                                    // Sort descending
                                    const sortedIndices = [...indices].sort((a, b) => b - a);

                                    for (const idx of sortedIndices) {
                                        const target = dataList[idx - 1];
                                        if (target) {
                                            const dataId = target.phone_number; // ID disimpan di phone_number
                                            const { error } = await supabase
                                                .from('data_harian')
                                                .delete()
                                                .eq('id', dataId);

                                            if (!error) {
                                                successCount++;
                                                deletedNames.push(target.push_name || `Data ${idx}`);
                                            }
                                        }
                                    }

                                    if (successCount > 0) {
                                        replyText = `✅ Berhasil menghapus ${successCount} data:\n- ${deletedNames.join('\n- ')}`;
                                    } else {
                                        // JIKA 0 DATA TERHAPUS: Berarti gagal karena izin (RLS) atau data sudah hilang
                                        replyText = '❌ Gagal menghapus.\n\nKemungkinan penyebab:\n1. Izin database (RLS) memblokir bot.\n2. Data sudah dihapus sebelumnya.\n\n(Pastikan SERVICE_KEY sudah dipasang)';
                                    }

                                    adminContactCache.delete(senderPhone + '_data');
                                    adminUserListCache.delete(senderPhone);
                                    adminUserListCache.delete(senderPhone + '_selected');
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'EXPORT_SELECT_DATE') {
                        // Admin pilih export hari ini atau tanggal lain
                        if (normalized === '1') {
                            // Export hari ini
                            await sock.sendMessage(remoteJid, { text: '⏳ Sedang menyiapkan file export...' });

                            const lookupNameFn = (ph: string) => getRegisteredUserNameSync(ph) || undefined;
                            const exportResult = await generateExportData(processingDayKey, lookupNameFn);

                            if (!exportResult || exportResult.count === 0) {
                                replyText = '📂 Belum ada data pendaftaran hari ini untuk diexport.';
                            } else {
                                // 1. Kirim TXT
                                const txtBuffer = Buffer.from(exportResult.txt, 'utf-8');
                                await sock.sendMessage(remoteJid, {
                                    document: txtBuffer,
                                    mimetype: 'text/plain',
                                    fileName: `${exportResult.filenameBase}.txt`,
                                    caption: `📄 Laporan Detail Data (${exportResult.count} data)`
                                });

                                // 2. Kirim Excel
                                const { data: excelDataRaw } = await supabase
                                    .from('data_harian')
                                    .select('*')
                                    .eq('processing_day_key', processingDayKey)
                                    .order('sender_phone', { ascending: true })
                                    .order('received_at', { ascending: true });

                                if (excelDataRaw && excelDataRaw.length > 0) {
                                    // ENRICH & SORT BY NAME
                                    // PRIORITAS: 1. Cache/LID (Nama Terbaru), 2. DB History (Nama Lama/Snapshot), 3. No HP
                                    const enriched = excelDataRaw.map((row: any) => {
                                        const currentName = getRegisteredUserNameSync(row.sender_phone);
                                        const finalSender = currentName || row.sender_name || row.sender_phone;
                                        return { ...row, sender_name: finalSender };
                                    });

                                    // Sort A-Z
                                    enriched.sort((a, b) => {
                                        const nA = (a.sender_name || '').toUpperCase();
                                        const nB = (b.sender_name || '').toUpperCase();
                                        return nA.localeCompare(nB);
                                    });

                                    const excelBuffer = generateKJPExcel(enriched);
                                    await sock.sendMessage(remoteJid, {
                                        document: excelBuffer,
                                        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        fileName: `${exportResult.filenameBase}.xlsx`,
                                        caption: `📊 Laporan Excel (${enriched.length} data)`
                                    });
                                }

                                replyText = '✅ Export data (TXT & Excel) selesai.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '2') {
                            // Pilih tanggal lain
                            adminFlowByPhone.set(senderPhone, 'EXPORT_CUSTOM_DATE');
                            replyText = [
                                '📅 *EXPORT TANGGAL LAIN*',
                                '',
                                'Ketik tanggal dengan format bebas:',
                                `• DD-MM-YYYY (${dmyExample})`,
                                '• DD/MM/YYYY (01/01/2026)',
                                '• DDMMYYYY (01012026)',
                                '• DD MMM YYYY (1 Januari 2026)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilih 1 (Hari Ini) atau 2 (Tanggal Lain). Ketik 0 untuk batal.';
                        }
                    } else if (currentAdminFlow === 'EXPORT_CUSTOM_DATE') {
                        // Admin ketik tanggal custom untuk export - FLEXIBLE FORMAT
                        // parseFlexibleDate returns YYYY-MM-DD or null
                        const iso = parseFlexibleDate(rawTrim);
                        if (!iso) {
                            replyText = '⚠️ Format tanggal tidak dikenali.\n\nContoh format yang diterima:\n• 22-01-2026\n• 22/01/2026\n• 22012026\n• 22 Januari 2026\n\nKetik 0 untuk batal.';
                        } else {
                            await sock.sendMessage(remoteJid, { text: '⏳ Sedang menyiapkan file export...' });

                            const lookupNameFn = (ph: string) => getRegisteredUserNameSync(ph) || undefined;
                            const exportResult = await generateExportData(iso, lookupNameFn);

                            const displayDate = iso.split('-').reverse().join('-');
                            if (!exportResult || exportResult.count === 0) {
                                replyText = `📂 Tidak ada data pendaftaran pada tanggal ${displayDate}.`;
                            } else {
                                // 1. Kirim TXT
                                const txtBuffer = Buffer.from(exportResult.txt, 'utf-8');
                                await sock.sendMessage(remoteJid, {
                                    document: txtBuffer,
                                    mimetype: 'text/plain',
                                    fileName: `${exportResult.filenameBase}.txt`,
                                    caption: `📄 Laporan Detail Data ${displayDate} (${exportResult.count} data)`
                                });

                                // 2. Kirim Excel
                                const { data: excelDataRaw } = await supabase
                                    .from('data_harian')
                                    .select('*')
                                    .eq('processing_day_key', iso)
                                    .order('sender_phone', { ascending: true })
                                    .order('received_at', { ascending: true });

                                if (excelDataRaw && excelDataRaw.length > 0) {
                                    // ENRICH & SORT BY NAME
                                    // PRIORITAS: 1. Cache/LID (Nama Terbaru), 2. DB History (Nama Lama/Snapshot), 3. No HP
                                    const enriched = excelDataRaw.map((row: any) => {
                                        const currentName = getRegisteredUserNameSync(row.sender_phone);
                                        const finalSender = currentName || row.sender_name || row.sender_phone;
                                        return { ...row, sender_name: finalSender };
                                    });

                                    // Sort Array by sender_name A-Z
                                    enriched.sort((a, b) => {
                                        const nA = (a.sender_name || '').toUpperCase();
                                        const nB = (b.sender_name || '').toUpperCase();
                                        return nA.localeCompare(nB);
                                    });

                                    const excelBuffer = generateKJPExcel(enriched);
                                    await sock.sendMessage(remoteJid, {
                                        document: excelBuffer,
                                        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        fileName: `${exportResult.filenameBase}.xlsx`,
                                        caption: `📊 Laporan Excel ${displayDate} (${enriched.length} data)`
                                    });
                                }

                                replyText = '✅ Export data (TXT & Excel) selesai.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        }
                    } else if (currentAdminFlow === 'SETTING_CLOSE_TIME_MENU') {
                        // SUB-MENU JAM TUTUP (UPDATED)
                        if (normalized === '1') {
                            // 1. Manual -> Wizard Start (Harian)
                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TIME_START');
                            replyText = '⏰ *INPUT JAM TUTUP HARIAN*\n\nSilakan masukkan jam mulai tutup (Format HH:mm).\nContoh: *04:00*\n\n_Ketik 0 untuk batal._';
                        } else if (normalized === '2') {
                            // 2. Tutup Sekarang (Harian/Force)
                            // FIX TIMEZONE: Use getWibParts
                            const nowParts = getWibParts(new Date());
                            const timeNow = `${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')}`;

                            // Simpan start time di broadcastDraftMap (temp)
                            broadcastDraftMap.set(senderPhone, { targets: [], message: timeNow }); // Store START_TIME

                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TIME_END');
                            replyText = `⏰ *TUTUP SEKARANG (${timeNow})*\n\nOke, bot akan tutup mulai jam ${timeNow}.\n\nSekarang, jam berapa bot akan *BUKA KEMBALI* (besok/nanti)? (Format HH:mm)\nContoh: *08:00*\n\n_Ketik 0 untuk batal._`;
                        } else if (normalized === '3') {
                            // 3. Tutup Jangka Panjang (LIBUR) -- NEW FEATURE
                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_LONG_TERM');
                            replyText = [
                                '🗓️ *TUTUP JANGKA PANJANG (LIBUR)*',
                                '',
                                'Bot akan tutup mulai *SEKARANG*.',
                                'Silakan masukkan *Tanggal Buka Kembali*.',
                                '',
                                'Format yang diterima:',
                                '• Jumlah Hari (contoh: *3* artinya libur 3 hari)',
                                '• Tanggal (contoh: *05-02-2026*)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '4') {
                            // 4. BUKA SEKARANG (Force Open / Cancel Maintenance)
                            // Matikan mode libur & Reset jam tutup harian ke 00:00 (Tidak ada maintenance)
                            const success = await updateBotSettings({
                                manual_close_start: null,
                                manual_close_end: null,
                                close_hour_start: 0,
                                close_minute_start: 0,
                                close_hour_end: 0,
                                close_minute_end: 0
                            });

                            if (success) {
                                clearBotSettingsCache();
                                replyText = `✅ *BOT BERHASIL DIBUKA*\n\nSemua mode tutup (Harian/Libur) telah dinonaktifkan.\nBot sekarang *ONLINE 24 JAM*.\n\n_Untuk mengaktifkan maintenance harian lagi, pilih menu 1._`;
                            } else {
                                replyText = '❌ Gagal update setting.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else {
                            replyText = '⚠️ Pilih 1, 2, 3, atau 4. Ketik 0 untuk batal.';
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_LONG_TERM') {
                        // Handler Input Tutup Jangka Panjang
                        const input = rawTrim;

                        // Cek apakah angka (Jumlah Hari)
                        if (/^\d+$/.test(input)) {
                            const days = parseInt(input);
                            if (days > 0 && days < 365) {
                                // Hitung tanggal buka = NOW + Days
                                const now = new Date();
                                const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
                                // Set jam buka ke 06:00 WIB (Default start day) agar rapi? Atau jam saat ini?
                                // Biasanya libur selesai pagi hari. Kita set ke jam 00:00 atau jam 06:00?
                                // Mari set ke jam yang sama saat ini, atau default ke 00:00.
                                // Untuk keamanan, kita set ke jam saat ini.

                                const startIso = now.toISOString();
                                const endIso = endDate.toISOString();

                                const success = await updateBotSettings({
                                    manual_close_start: startIso,
                                    manual_close_end: endIso
                                });

                                if (success) {
                                    clearBotSettingsCache();
                                    replyText = `✅ *MODA LIBUR AKTIF*\n\nBot tutup selama *${days} hari*.\nBuka kembali: *${endDate.toLocaleDateString('id-ID')}*`;
                                } else {
                                    replyText = '❌ Gagal menyimpan pengaturan.';
                                }
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                replyText = '⚠️ Jumlah hari tidak wajar. Masukkan 1-30. Ketik 0 batal.';
                            }
                        }
                        // Cek apakah Tanggal (DD-MM-YYYY)
                        else {
                            const iso = parseFlexibleDate(input); // returns YYYY-MM-DD
                            if (iso) {
                                // Set target buka jam 00:00 atau jam 06:00 pada tanggal tersebut?
                                // ISO string from dateParser usually is YYYY-MM-DD.
                                // Let's make it YYYY-MM-DDT06:00:00 (Pagi)
                                const endIso = `${iso}T06:00:00.000Z`; // UTC? No wait.
                                // We need proper ISO string handling.
                                // parseFlexibleDate usage:
                                // if input 05-02-2026 -> 2026-02-05

                                // Create Date Object from that
                                const startDate = new Date();
                                const targetDate = new Date(iso); // This defaults to UTC 00:00 usually
                                targetDate.setHours(6, 0, 0, 0); // Set to 06:00 Local/Server?

                                // Validasi: Tanggal harus masa depan
                                if (targetDate <= startDate) {
                                    replyText = '⚠️ Tanggal harus di masa depan.';
                                } else {
                                    const success = await updateBotSettings({
                                        manual_close_start: startDate.toISOString(),
                                        manual_close_end: targetDate.toISOString()
                                    });

                                    if (success) {
                                        clearBotSettingsCache();
                                        const dateDisplay = targetDate.toLocaleDateString('id-ID');
                                        replyText = `✅ *MODA LIBUR AKTIF*\n\nBot tutup sampai tanggal *${dateDisplay}* (Pukul 06:00).`;
                                    } else {
                                        replyText = '❌ Gagal menyimpan.';
                                    }
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                }
                            } else {
                                if (input === '0') {
                                    replyText = '✅ Batal.';
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                } else {
                                    replyText = '⚠️ Format tidak dikenali. Masukkan jumlah hari (3) atau tanggal (25-02-2026).';
                                }
                            }
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_TIME_START') {
                        // Wizard Step 1: Input Start Time
                        const timePattern = /^(\d{1,2}):(\d{2})$/;
                        const match = rawTrim.match(timePattern);
                        if (!match) {
                            replyText = '⚠️ Format jam salah. Gunakan HH:mm (contoh: 04:01). Ketik 0 untuk batal.';
                        } else {
                            const h = parseInt(match[1]);
                            const m = parseInt(match[2]);
                            if (h > 23 || m > 59) {
                                replyText = '⚠️ Jam tidak valid (00-23, 00-59).';
                            } else {
                                // Valid. Simpan sementara di draft map
                                const validTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                broadcastDraftMap.set(senderPhone, { targets: [], message: validTime }); // Store START_TIME

                                adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TIME_END');
                                replyText = `✅ Mulai tutup: *${validTime}*\n\nSelanjutnya, jam berapa bot akan *BUKA KEMBALI*? (Format HH:mm)\nContoh: *06:00*`;
                            }
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_TIME_END') {
                        // Wizard Step 2: Input End Time & Execute
                        const timePattern = /^(\d{1,2}):(\d{2})$/;
                        const match = rawTrim.match(timePattern);
                        if (!match) {
                            replyText = '⚠️ Format jam salah. Gunakan HH:mm (contoh: 06:00). Ketik 0 untuk batal.';
                        } else {
                            const hEnd = parseInt(match[1]);
                            const mEnd = parseInt(match[2]);
                            if (hEnd > 23 || mEnd > 59) {
                                replyText = '⚠️ Jam tidak valid (00-23, 00-59).';
                            } else {
                                // Ambil start time dari temp storage
                                const draft = broadcastDraftMap.get(senderPhone);
                                const startTimeStr = draft?.message || '00:00'; // Fallback unlikely
                                const [hStartStr, mStartStr] = startTimeStr.split(':');
                                const hStart = parseInt(hStartStr);
                                const mStart = parseInt(mStartStr);

                                // Saat set harian, matikan Manual Override (Libur) jika ada
                                const success = await updateBotSettings({
                                    close_hour_start: hStart,
                                    close_minute_start: mStart,
                                    close_hour_end: hEnd,
                                    close_minute_end: mEnd,
                                    manual_close_start: null, // Reset Long Term
                                    manual_close_end: null
                                });

                                if (success) {
                                    clearBotSettingsCache();
                                    const timeRange = `${startTimeStr} s.d ${String(hEnd).padStart(2, '0')}:${String(mEnd).padStart(2, '0')} WIB`;
                                    replyText = `✅ *JAM TUTUP HARIAN BERHASIL DIUBAH*\n\nBot akan tutup pada:\n🕒 *${timeRange}*\n\nUser tidak bisa input data pada jam tersebut.`;
                                } else {
                                    replyText = '❌ Gagal menyimpan pengaturan.';
                                }

                                broadcastDraftMap.delete(senderPhone); // Clean up
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_MSG_MENU') {
                        // SUB-MENU EDIT PESAN TUTUP
                        if (normalized === '1') {
                            // 1. Template Standar
                            const success = await updateBotSettings({
                                close_message_template: CLOSE_MESSAGE_TEMPLATE_UNIFIED
                            });
                            if (success) {
                                clearBotSettingsCache();
                                replyText = [
                                    '✅ *TEMPLATE BERHASIL DIGANTI*',
                                    '',
                                    'Sekarang menggunakan *Template Standar* (Maintenance & Rekapitulasi).',
                                    'Bot akan otomatis mengisi jam buka kembali.'
                                ].join('\n');
                            } else {
                                replyText = '❌ Gagal menyimpan template.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '2') {
                            // 2. Custom -> Lanjut ke flow manual lama
                            const currentSettings = await getBotSettings();
                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_MSG');
                            replyText = [
                                '📝 *EDIT TEMPLATE CUSTOM*',
                                '',
                                'Silakan copy teks di bawah ini, edit sesuai keinginan, lalu kirim balik.',
                                '',
                                '```' + currentSettings.close_message_template + '```',
                                '',
                                '_(Ketik 0 untuk batal)_'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilih 1 atau 2.';
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_MSG') {
                        // Handler SIMPAN Custom Message
                        if (rawTrim.length < 10) {
                            replyText = '⚠️ Template terlalu pendek. Minimal 10 karakter.\n\nKetik 0 untuk batal.';
                        } else {
                            const success = await updateBotSettings({
                                close_message_template: rawTrim
                            });

                            if (success) {
                                clearBotSettingsCache();
                                replyText = [
                                    '✅ *TEMPLATE CUSTOM DISIMPAN*',
                                    '',
                                    '📝 Preview:',
                                    '─────────────────',
                                    rawTrim,
                                    '─────────────────'
                                ].join('\n');
                            } else {
                                replyText = '❌ Gagal menyimpan template. Coba lagi.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }

                // --- CUSTOMER MENU ---
                if (normalized === '1' || normalized.includes('DAFTAR')) {
                    // New Flow: Ask for Location -> Trigger Menu Bertingkat if 1 chosen
                    // RESET LOCATION STATE -> User harus pilih lokasi baru setiap sesi baru
                    pendingRegistrationData.delete(senderPhone);
                    userLocationChoice.delete(senderPhone);
                    userSpecificLocationChoice.delete(senderPhone);
                    console.log(`[DEBUG] DELETE Specific Location for ${senderPhone} (RESET MENU)`);

                    userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                    replyText = FORMAT_DAFTAR_MESSAGE;
                } else if (normalized === '2' || normalized.startsWith('CEK')) {
                    pendingDelete.delete(senderPhone);
                    // LANGSUNG TAMPILKAN DATA HARI INI menggunakan buildReplyForTodayRecap
                    const { validCount, totalInvalid, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                    if (validCount === 0) {
                        const dateDisplay = processingDayKey.split('-').reverse().join('-');
                        replyText = [
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                            '🔎 *STATUS DATA HARI INI*',
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                            '',
                            `📅 Periode: *${dateDisplay}* (06.01–04.00 WIB)`,
                            '',
                            '❌ *Belum ada data terdaftar*',
                            '',
                            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                            '💡 _Ketik *MENU* untuk kembali._'
                        ].join('\n');
                    } else {
                        // Gunakan buildReplyForTodayRecap yang sudah ada lokasi & tanggal lahir
                        replyText = buildReplyForTodayRecap(validCount, totalInvalid, validItems, processingDayKey);
                        // Tambahkan tips hapus di akhir
                        replyText += '\n💡 _Ketik *EDIT* untuk mengubah data._';
                        replyText += '\n💡 _Ketik *HAPUS 1* atau *HAPUS 1,2,3* untuk menghapus data._';
                    }
                } else if (normalized.startsWith('EDIT')) {
                    // --- HANDLER COMMAND EDIT (STRICT NO ARGS) ---
                    pendingDelete.delete(senderPhone);
                    const args = normalized.replace('EDIT', '').trim();

                    // BLOCK: Jika ada argumen (misal EDIT 1), tolak halus.
                    if (args.length > 0) {
                        replyText = '⚠️ *PERINTAH EDIT BERUBAH*\n\nMohon hanya ketik *EDIT* saja untuk memulai.\nNanti saya akan tampilkan daftar data yang bisa dipilih.';
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }

                    // 1. Ambil data hari ini (Editable items with ID)
                    const items = await getEditableItemsForSender(senderPhone, processingDayKey);

                    if (items.length === 0) {
                        replyText = '⚠️ *DATA KOSONG*\nAnda belum mengirim data hari ini, tidak ada yang bisa diedit.';
                    } else {
                        // 2. Init Session
                        const session: EditSession = {
                            recordsToday: items,
                        };

                        // SHOW LIST TO PICK RECORD
                        editSessionMap.set(senderPhone, session);
                        userFlowByPhone.set(senderPhone, 'EDIT_PICK_RECORD');

                        const listRows = items.map((item, i) => {
                            return `${i + 1}. ${item.nama}`;
                        });

                        replyText = [
                            '📝 *EDIT DATA HARI INI*',
                            '',
                            'Pilih nomor data yang mau diedit:',
                            '',
                            ...listRows,
                            '',
                            '_Ketik nomor urutnya (Contoh: 1)._',
                            '_Ketik 0 untuk batal._'
                        ].join('\n');
                    }

                } else if (normalized.startsWith('HAPUS')) {
                    // FITUR HAPUS DENGAN FORMAT: HAPUS 1 atau HAPUS 1,2,3
                    pendingDelete.delete(senderPhone);
                    const hapusArgs = normalized.replace('HAPUS', '').trim();

                    if (!hapusArgs) {
                        // Jika hanya ketik HAPUS tanpa angka, tampilkan daftar
                        const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                        if (validCount === 0) {
                            replyText = '⚠️ Anda belum mengirim data pendaftaran hari ini.';
                        } else {
                            const list = validItems.map((item, idx) => `${idx + 1}. ${item.nama} (${item.no_kjp})`).join('\n');
                            replyText = [
                                '🗑️ *HAPUS DATA*',
                                '',
                                'Data Anda hari ini:',
                                list,
                                '',
                                'Ketik *HAPUS 1* untuk hapus data nomor 1',
                                'Ketik *HAPUS 1,2,3* untuk hapus beberapa data',
                                '',
                                '_Ketik MENU untuk kembali._'
                            ].join('\n');
                        }
                    } else {
                        // Parse angka dari HAPUS 1,2,3 atau HAPUS 1 2 3
                        const indices = hapusArgs.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);

                        if (indices.length === 0) {
                            replyText = '⚠️ Format salah. Contoh: *HAPUS 1* atau *HAPUS 1,2,3*';
                        } else {
                            // Hapus data berdasarkan index
                            let successCount = 0;
                            const deletedNames: string[] = [];

                            // Sort descending agar index tidak bergeser saat hapus
                            const sortedIndices = [...indices].sort((a, b) => b - a);

                            for (const idx of sortedIndices) {
                                const res = await deleteDailyDataByIndex(senderPhone, processingDayKey, idx);
                                if (res.success) {
                                    successCount++;
                                    deletedNames.push(res.deletedName || `Data ${idx}`);
                                }
                            }

                            // Cek apakah sukses
                            if (successCount > 0) {
                                // PERBAIKAN: Tampilkan nama yang dihapus
                                const deletedNameStr = deletedNames.length > 0 ? ` *${deletedNames.join(', ')}*` : '';
                                replyText = `✅ Sukses menghapus ${successCount} data${deletedNameStr}.`;

                                // Jika data habis, reset flow
                                const { validCount } = await getTodayRecapForSender(senderPhone, processingDayKey);
                                if (validCount === 0) {
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                } else {
                                    // Tampilkan sisa data
                                    replyText += `\n\nSisa data: ${validCount}`;
                                }
                            } else {
                                replyText = '❌ Gagal menghapus data. Pastikan nomor urut benar.';
                            }
                        }
                    }
                } else if (normalized === '3' || normalized.includes('HAPUS DATA')) {
                    pendingDelete.delete(senderPhone); // disable old logic
                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                    if (validCount === 0) {
                        replyText = '⚠️ Anda belum mengirim data pendaftaran hari ini.';
                    } else {
                        userFlowByPhone.set(senderPhone, 'DELETE_DATA');
                        const list = validItems.map((item, idx) => `${idx + 1}. ${item.nama} (Kartu: ...${item.no_kjp.slice(-4)})`).join('\n');
                        replyText = [
                            '🗑️ *HAPUS DATA PENDAFTARAN*',
                            '',
                            '📋 Pilih data yang ingin dihapus:',
                            '',
                            list,
                            '',
                            '👇 *Cara hapus:*',
                            '• Ketik *1* untuk hapus satu data',
                            '• Ketik *1,2,3* untuk hapus beberapa sekaligus',
                            '• Ketik *0* untuk batal',
                            '',
                            '_Contoh: Ketik 2 untuk hapus data nomor 2_'
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
                } else if (normalized === '4' || normalized === 'EDIT') {
                    // Handler EDIT dipindahkan dari blok 'EDIT' manual ke menu 4 agar konsisten
                    // (Logic handler 'EDIT' yang ada di bawah blok 'HAPUS' tetap bisa menangkap 'EDIT <args>' karena normalized.startsWith('EDIT'))
                    // Tapi jika user ketik '4', kita trigger EDIT flow
                    pendingDelete.delete(senderPhone);
                    const items = await getEditableItemsForSender(senderPhone, processingDayKey);

                    if (items.length === 0) {
                        replyText = '⚠️ *DATA KOSONG*\nAnda belum mengirim data hari ini, tidak ada yang bisa diedit.';
                    } else {
                        // Init Session
                        const session: EditSession = {
                            recordsToday: items,
                        };

                        // SHOW LIST TO PICK RECORD
                        editSessionMap.set(senderPhone, session);
                        userFlowByPhone.set(senderPhone, 'EDIT_PICK_RECORD');

                        const listRows = items.map((item, i) => {
                            const typeLabel = (item.lokasi && item.lokasi.startsWith('PASARJAYA')) ? '[PSJ]' : '[DHJ]';
                            return `${i + 1}. ${item.nama} ${typeLabel}`;
                        });

                        replyText = [
                            '📝 *EDIT DATA HARI INI*',
                            '',
                            'Pilih nomor data yang mau diedit:',
                            '',
                            ...listRows,
                            '',
                            '_Ketik nomor urutnya (Contoh: 1)._',
                            '_Ketik 0 untuk batal._'
                        ].join('\n');
                    }
                } else if (normalized === '5' || normalized === 'BANTUAN') {
                    // FAQ hanya muncul jika ketik '5' atau 'BANTUAN' (exact match, tanpa embel-embel)
                    replyText = FAQ_MESSAGE;
                } else {

                    // Logic Baru: Terima Partial Success dengan AUTO-DETECT FORMAT
                    const lines = parseRawMessageToLines(messageText);

                    // AUTO-DETECT: Cek apakah baris ke-5 atau setiap baris ke-5 (dalam multi-data) adalah tanggal
                    const looksLikeDatePattern = /^\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4}$/;

                    // Deteksi format berdasarkan pattern data
                    let detectedFormat: 'PASARJAYA' | 'DHARMAJAYA' | null = null;

                    // Cek untuk single data (5 baris = Pasarjaya, 4 baris = Dharmajaya)
                    if (lines.length === 5 && looksLikeDatePattern.test(lines[4]?.trim() || '')) {
                        detectedFormat = 'PASARJAYA';
                    } else if (lines.length === 4) {
                        detectedFormat = 'DHARMAJAYA';
                    }
                    // Cek untuk multi data (kelipatan 5 dengan tanggal = Pasarjaya, kelipatan 4 = Dharmajaya) 
                    else if (lines.length >= 5 && lines.length % 5 === 0) {
                        // Cek apakah setiap baris ke-5 adalah tanggal
                        let allDates = true;
                        for (let i = 4; i < lines.length; i += 5) {
                            if (!looksLikeDatePattern.test(lines[i]?.trim() || '')) {
                                allDates = false;
                                break;
                            }
                        }
                        if (allDates) detectedFormat = 'PASARJAYA';
                    } else if (lines.length >= 4 && lines.length % 4 === 0) {
                        detectedFormat = 'DHARMAJAYA';
                    }

                    // STRICT LOGIC:
                    // 1. Cek User Choice Session (userLocationChoice)
                    const existingLocation = userLocationChoice.get(senderPhone);
                    const isNewUser = existingLocation === undefined;

                    // 2. Logic "Block jika format tidak sesuai user choice"
                    // - Pasarjaya (5 baris) dikirim 4 baris => TOLAK (detectedFormat=DHARMAJAYA)
                    // - Dharmajaya (4 baris) dikirim 5 baris => TOLAK (detectedFormat=PASARJAYA) -> Bisa debatable, tapi biar strict kita tolak
                    let blockStrictMismatch = false;

                    if (existingLocation === 'PASARJAYA' && detectedFormat === 'DHARMAJAYA') {
                        // User sudah pilih Pasarjaya, tapi input 4 baris (terdeteksi Dharmajaya)
                        blockStrictMismatch = true;
                    } else if (existingLocation === 'DHARMAJAYA' && detectedFormat === 'PASARJAYA') {
                        // User sudah pilih Dharmajaya (4 baris), tapi kirim format Pasarjaya (5 baris)
                        // Kita TOLAK juga agar konsisten
                        blockStrictMismatch = true;
                    }

                    // 3. Logic "Tanya Dulu jika user baru"
                    // Jika user belum pernah pilih lokasi (isNewUser) dan langsung kirim data valid,
                    // KITA BLOCK DULU DAN TANYA LOKASI.
                    // Kecuali jika anda ingin auto-accept User Baru. Tapi requestnya adalah "Tanya dulu".
                    let blockAskLocation = false;
                    if (isNewUser && detectedFormat) {
                        blockAskLocation = true;
                    }

                    // --- EXECUTION BLOCKS ---

                    if (blockAskLocation) {
                        // Tolak halus dan minta pilih lokasi
                        await sock.sendMessage(remoteJid, {
                            text: `⚠️ *Mohon Pilih Lokasi Dulu*\n\nData Anda sepertinya valid, tapi saya perlu tahu Anda mau ambil sembako di mana?\n\nKetik *1* untuk Pasarjaya\nKetik *2* untuk Dharmajaya Duri Kosambi`
                        });
                        userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                        // Jangan continue, biarkan logic bawah skip karena if (lines.length >= minLines) akan kita guard
                        // Tapi agar aman, kita return loop ini atau continue
                        continue;
                    }

                    if (blockStrictMismatch) {
                        if (existingLocation === 'PASARJAYA') {
                            await sock.sendMessage(remoteJid, {
                                text: `⚠️ *DATA TERTOLAK (Salah Format)*\n\nAnda memilih **PASARJAYA**, maka wajib kirim **5 Baris** (termasuk Tanggal Lahir).\n\nAnda hanya mengirim 4 baris.\nSilakan lengkapi data Anda dengan Tanggal Lahir di baris ke-5.`
                            });
                        } else {
                            await sock.sendMessage(remoteJid, {
                                text: `⚠️ *DATA TERTOLAK (Salah Format)*\n\nAnda memilih **DHARMAJAYA**, maka format data harus **4 Baris**.\n\nAnda mengirim 5 baris (dengan tanggal lahir).\nSilakan hapus baris tanggal lahir atau pilih lokasi Pasarjaya dari Menu.`
                            });
                        }
                        continue;
                    }

                    // Jika lolos semua block, tentukan final Context
                    // Jika user sudah punya choice, pakai choice. Jika baru (yg lolos), pakai detected.
                    // Tapi karena kita sudah blockAskLocation=true untuk user baru, maka di sini pasti existingLocation ada ATAU (jika kita disable blockAskLocation nanti).
                    // Untuk saat ini logicnya: Kita pakai existingLocation sebagai 'Truth'.
                    // Kalau user maksa kirim PASARJAYA format saat mode DHARMAJAYA, mungkin kita terima (upgrade)?
                    // Sesuai request: "Kalo sudah pilih Pasarjaya, HARUS 5 baris".

                    // Final decision logic:
                    let finalContext: 'PASARJAYA' | 'DHARMAJAYA' = existingLocation || detectedFormat || 'DHARMAJAYA';

                    // Update session biar sinkron (misal upgrade dari Dharmajaya ke Pasarjaya jika diperbolehkan, tapi strict mode melarang sebaliknya)
                    if (detectedFormat && !blockStrictMismatch && !isNewUser) {
                        // Allow switch context IF it matches strict rules (e.g. Dharmajaya user sends 5 lines -> maybe allow? or strict reject?)
                        // Request user hanya bilang "Kalau Pasarjaya harus 5 baris". Tidak bilang sebaliknya.
                        // Kita update aja jika valid.
                        userLocationChoice.set(senderPhone, detectedFormat);
                        finalContext = detectedFormat;
                    }

                    const minLines = finalContext === 'PASARJAYA' ? 5 : 4;

                    if (lines.length >= minLines) {
                        // Ambil lokasi spesifik dari session sebelumnya (jika ada)
                        const storedSpecificLocation = userSpecificLocationChoice.get(senderPhone);
                        console.log(`[DEBUG] GET Specific Location for ${senderPhone}: ${storedSpecificLocation}`);

                        // VALIDASI BARU: Jika PASARJAYA tapi belum pilih lokasi spesifik, minta pilih dulu
                        if (finalContext === 'PASARJAYA' && !storedSpecificLocation) {
                            // Simpan data pending agar tidak perlu kirim ulang
                            pendingRegistrationData.set(senderPhone, messageText);
                            userFlowByPhone.set(senderPhone, 'SELECT_PASARJAYA_SUB');
                            await sock.sendMessage(remoteJid, {
                                text: [
                                    '📍 *PILIH LOKASI PENGAMBILAN DULU*',
                                    '',
                                    'Data Anda sudah terdeteksi format Pasarjaya (5 baris).',
                                    'Tapi saya perlu tahu lokasi pengambilannya dimana?',
                                    '',
                                    '1. 🏭 Jakgrosir Kedoya',
                                    '2. 🏙️ Gerai Rusun Pesakih',
                                    '3. 🏪 Mini DC Kec. Cengkareng',
                                    '4. 🛒 Jakmart Bambu Larangan',
                                    '5. 📝 Lokasi Lain...',
                                    '',
                                    '_Ketik angka pilihanmu! (1-5)_'
                                ].join('\n')
                            });
                            continue;
                        }

                        const logJson = await processRawMessageToLogJson({
                            text: messageText,
                            senderPhone,
                            messageId: msg.key.id,
                            receivedAt,
                            tanggal: tanggalWib,
                            processingDayKey,
                            locationContext: finalContext, // PASS CONTEXT
                            specificLocation: storedSpecificLocation // PASS STORED SPECIFIC LOCATION
                        });

                        // INJECT SENDER NAME (untuk disimpan di tabe data_harian)
                        logJson.sender_name = existingName || undefined;

                        if (logJson.stats.total_blocks > 0) {
                            // Ambil detail data hari ini (fetch fresh data to show in reply)
                            const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);
                            const totalTodayIncludingCurrent = validCount + (logJson.stats.ok_count || 0);

                            // STRICT VALIDATION:
                            // Jika ada sisa baris (remainder) yang gagal diparsing, TOLAK SELURUH PESAN.
                            // Jangan simpan partial clean data. User harus kirim ulang dengan benar.
                            if (logJson.failed_remainder_lines && logJson.failed_remainder_lines.length > 0) {
                                // REJECTION REPLY
                                const expectedLines = finalContext === 'PASARJAYA' ? 5 : 4;
                                replyText = [
                                    '❌ *DATA BELUM LENGKAP / FORMAT SALAH*',
                                    '',
                                    `⚠️ Anda mengirim data dengan jumlah baris yang tidak sesuai`,
                                    `Lokasi: *${finalContext}*`,
                                    `Syarat: *${expectedLines} baris per data*`,
                                    '',
                                    '❌ *MASALAH:*',
                                    'Ada baris data yang menggantung / tidak lengkap.',
                                    '',
                                    '💡 *SOLUSI:*',
                                    'Pastikan setiap 1 data orang terdiri dari ' + expectedLines + ' baris.',
                                    'Jika daftar banyak orang, pisahkan dengan baris kosong/enter.',
                                    '',
                                    '👇 *CONTOH YANG BENAR:*',
                                    finalContext === 'PASARJAYA'
                                        ? 'Siti Aminah\n5049488500001234\n3171234567890123\n3171098765432109\n15-08-1975'
                                        : 'Siti Aminah\n5049488500001234\n3171234567890123\n3171098765432109',
                                    '',
                                    'Mohon kirim ulang ya Bu/Pak 🙏'
                                ].join('\n');
                            } else {
                                // DATA BERSIH (Valid Blocks Only & No Remainder) -> PROSES SIMPAN
                                await saveLogAndOkItems(logJson, messageText);

                                // Refresh total after saving - and get ITEMS (Pass true to force refresh if cache mechanism exists, but function doesn't support it yet)
                                // Important: getTodayRecapForSender queries DB directly, so it will see the engaged inserted records.
                                const { validCount: finalTotalCount, validItems: finalItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                                // Pass 'finalItems' to buildReplyForNewData to show the Clean List of names
                                replyText = buildReplyForNewData(logJson, finalTotalCount, finalContext, finalItems);
                            }
                        } else {
                            // Kasus langka: >= 4 baris tapi tidak ada blok valid satu pun?
                            replyText = `⚠️ *Format Data Salah*\nPastikan format sesuai dengan lokasi **${finalContext}** (${minLines} baris per orang).`;
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

                        if (inputLineCount >= 2 && inputLineCount <= 3) {
                            // 2-3 baris = kemungkinan data tidak lengkap
                            // Cek apakah ada angka panjang (nomor kartu/KTP) di salah satu baris
                            const hasLongNumbers = inputLines.some(line => {
                                const digits = line.replace(/\D/g, '');
                                return digits.length >= 10;
                            });

                            if (hasLongNumbers) {
                                // Kemungkinan user coba kirim data tapi tidak lengkap
                                const formatGuide = `⚠️ *DATA TIDAK LENGKAP*

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

Ketik *1* untuk panduan daftar.`;
                                await sock.sendMessage(remoteJid, { text: formatGuide });
                            } else {
                                // Input random 2-3 kata/baris tanpa angka panjang
                                await sock.sendMessage(remoteJid, { text: 'Hai! 👋 Mau daftar sembako?\n\nKetik *1* untuk mulai~ 😊' });
                            }
                        } else if (inputLineCount >= 5 && inputLineCount % 4 !== 0 && inputLineCount % 5 !== 0) {
                            // 5+ baris tapi bukan kelipatan 4 atau 5
                            const formatGuide = `⚠️ *DATA TIDAK LENGKAP*

Jumlah baris harus kelipatan:
• 4 baris (Dharmajaya: Nama, Kartu, KTP, KK)
• 5 baris (Pasarjaya: Nama, Kartu, KTP, KK, Tanggal Lahir)

Anda mengirim ${inputLineCount} baris.

Ketik MENU untuk bantuan.`;
                            await sock.sendMessage(remoteJid, { text: formatGuide });
                        } else {
                            // Input lain (mungkin emoji, stiker, dll)
                            await sock.sendMessage(remoteJid, { text: 'Hai! 👋 Mau daftar sembako?\n\nKetik *1* untuk mulai~ 😊' });
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
