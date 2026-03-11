# Source Log Pilihan untuk Sinkron Status

## Primary Source
- Folder: `D:\BOT\CEK STATUS DAN KIRIM BUKTI DHARMAJAYA TELEGRAM ONLY`
- File sukses: `reported_success_telegram_only.json`
- File gagal: `reported_failed_telegram_only.json` (muncul saat ada gagal)

## Fallback Source
- Folder: `D:\BOT\CEK STATUS DAN KIRIM BUKTI DHARMAJAYA`
- File sukses: `reported_success.json`

## Kenapa dipilih Telegram Only sebagai Primary
- Menyediakan jejak sukses + gagal, jadi cocok untuk laporan status komplit.
- Struktur data lebih siap untuk dashboard (status outcome + timestamp).

## Catatan Penting
- Log JSON bersifat operasional, bisa di-reset saat restart script.
- Untuk ketahanan jangka panjang, web harus membaca status dari tabel Supabase terpusat.
