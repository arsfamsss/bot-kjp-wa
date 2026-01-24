-- Create bot_settings table for Admin configuration
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bot_settings (
    id SERIAL PRIMARY KEY,
    close_hour_start INT DEFAULT 4,
    close_minute_start INT DEFAULT 1,
    close_hour_end INT DEFAULT 6,
    close_minute_end INT DEFAULT 0,
    close_message_template TEXT DEFAULT '⛔ *MOHON MAAF, SISTEM SEDANG TUTUP*
(Maintenance Harian)

🕒 Jam Tutup: *{JAM_TUTUP}*
✅ Buka Kembali: *Pukul {JAM_BUKA} WIB*

📌 Data yang Anda kirim sekarang *tidak akan diproses*.
Silakan kirim ulang setelah jam buka untuk pendaftaran besok.

_Terima kasih atas pengertiannya._ 🙏',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings row if not exists
INSERT INTO bot_settings (id, close_hour_start, close_minute_start, close_hour_end, close_minute_end)
VALUES (1, 4, 1, 6, 0)
ON CONFLICT (id) DO NOTHING;
