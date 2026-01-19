# Panduan Deployment 24/7 di Termux (Android)

Bot WhatsApp ini menggunakan **PM2** (Process Manager) agar bisa berjalan 24 jam non-stop, otomatis restart jika error, dan berjalan di background.

## 1. Instalasi PM2 (Jika Belum)

Di terminal Termux, jalankan perintah ini (cukup sekali):

```bash
npm install -g pm2
```

## 2. Menjalankan Bot (Start)

Untuk pertama kali menjalankan bot:

1. Pastikan Anda berada di folder bot:

   ```bash
   cd bot-kjp-wa
   ```

2. Jalankan bot dengan PM2:
   ```bash
   pm2 start "npm run dev" --name bot-wa
   ```
   > **Catatan:** Jika muncul Pairing Code, lihat terminal dengan perintah `pm2 logs`.

## 3. Perintah Dasar PM2 (Stop, Pause, Start)

Berikut adalah perintah-perintah untuk mengontrol bot:

- **Melihat Status Bot (Online/Stopped/Error):**

  ```bash
  pm2 list
  ```

- **Melihat Log (Pesan Masuk/Error/Pairing Code):**

  ```bash
  pm2 logs
  # Tekan Ctrl+C untuk keluar dari tampilan log (Bot TETAP JALAN di background)
  ```

- **Menghentikan Bot (Stop):**

  ```bash
  pm2 stop bot-wa
  ```

- **Menjalankan Kembali (Start/Resume):**

  ```bash
  pm2 start bot-wa
  ```

- **Restart Bot (Misal setelah update kode):**

  ```bash
  pm2 restart bot-wa
  ```

- **Mematikan Total & Hapus dari List:**
  ```bash
  pm2 delete bot-wa
  ```

## 4. Agar Bot Otomatis Jalan Saat HP Restart (Auto-Start)

Agar bot otomatis jalan ketika HP dinyalakan ulang (atau Termux dibuka), ikuti langkah ini:

1. **Simpan konfigurasi bot yang sedang jalan saat ini:**
   (Pastikan bot sedang status 'online' di `pm2 list`)

   ```bash
   pm2 save
   ```

   _Ini akan membuat file `dump.pm2` yang berisi daftar proses yang akan dijalankan._

2. **Setup script startup (opsional tapi disarankan untuk Termux):**
   Termux tidak seperti Linux server biasa (tidak ada systemd). Biasanya `pm2 resurrect` sudah cukup manual, tapi ada tips agar jalan saat Termux dibuka:

   Buat/Edit file `.bashrc`:

   ```bash
   nano ~/.bashrc
   ```

   Tambahkan baris ini di paling bawah:

   ```bash
   pm2 resurrect
   ```

   Simpan (`Ctrl+O`, Enter, `Ctrl+X`).

   _Efeknya: Setiap kali Anda membuka aplikasi Termux, dia akan mencoba menghidupkan kembali bot yang tersimpan._

## 5. Ringkasan Maintenance

- **Update Codingan:**

  ```bash
  git pull
  npm install
  pm2 restart bot-wa
  ```

- **Reset Authorisasi (Ganti Nomor Bot):**
  ```bash
  pm2 stop bot-wa
  rm -rf auth_info_baileys
  pm2 start bot-wa
  pm2 logs  # Cek kode pairing baru
  ```
