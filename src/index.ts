// src/index.ts
import express from 'express';
import { connectToWhatsApp, scheduleReconnectNow } from './wa';
import { startCsvContactsSync } from './services/csvContactsSync';
import { startSchedulePoller } from './services/locationScheduler';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Endpoint sederhana untuk cek status server
app.get('/', (req, res) => {
    res.send('🤖 Server Bot WhatsApp (Baileys) Aktif!');
});

app.listen(port, async () => {
    console.log(`🚀 Server HTTP berjalan di http://localhost:${port}`);

    // JALANKAN BOT WHATSAPP
    // SYNC CONTACTS DARI CSV (jalankan sebelum bot WA)
    try {
        startCsvContactsSync();
    } catch (error) {
        console.error('⚠️ CSV sync gagal start, proses bot tetap lanjut:', error);
    }

    try {
        startSchedulePoller();
        console.log('📅 Schedule poller dimulai');
    } catch (error) {
        console.error('⚠️ Schedule poller gagal start, proses bot tetap lanjut:', error);
    }

    // JALANKAN BOT WHATSAPP
    try {
        await connectToWhatsApp();
    } catch (error) {
        console.error('❌ Gagal koneksi awal ke WhatsApp. Bot akan coba reconnect otomatis.', error);
        scheduleReconnectNow('startup-failure');
    }
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection:', reason);
});
