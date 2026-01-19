// src/index.ts
import express from 'express';
import { connectToWhatsApp } from './wa';

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
    await connectToWhatsApp();
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection:', reason);
});