-- Tabel whitelist nomor HP
-- Hanya nomor yang ada di tabel ini yang boleh kirim pesan ke bot
CREATE TABLE IF NOT EXISTS whitelisted_phones (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone_number TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_phones_phone ON whitelisted_phones (phone_number);
