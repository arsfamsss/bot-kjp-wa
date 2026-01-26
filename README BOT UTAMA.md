# 🤖 BOT ANTRIAN PASAR JAYA (V52 STABLE OCR)

Bot otomatisasi pendaftaran antrian pangan bersubsidi Pasar Jaya. Versi ini menggabungkan stabilitas, dukungan proxy, sistem OCR ensemble, dan notifikasi Telegram real-time dengan data lengkap.

## 📋 Prasyarat

- **Node.js**: Pastikan sudah terinstall (versi 16+ direkomendasikan).
- **Python**: Diperlukan untuk OCR server (versi 3.8+).
- **Library Python**: `pip install flask pillow pytesseract requests`
- **Tesseract OCR**: Harus terinstall di sistem Windows.

## 🚀 Langkah Instalasi

1.  **Install Dependencies Node.js**:
    ```bash
    npm install
    ```

2.  **Siapkan Proxy (Opsional)**:
    Jika ingin menggunakan proxy, isi file `proxies.txt` dengan format `ip:port` atau `user:pass@ip:port` per baris.

## 🛠️ Cara Penggunaan (Workflow)

Ikuti langkah-langkah di bawah ini secara berurutan:

### 1. Persiapan Data (WhatsApp ke JSON)
Salin data mentah dari WhatsApp ke file `data_mentah_dari_whatsapp.txt`. Format didukung otomatis (Nama, NIK, KK, Kartu, Tgl Lahir).

Jalankan generator:
```bash
node account_generator.js
```
✅ **Output**: `accounts.json` (Sekarang mendukung nama lengkap termasuk teks dalam kurung).

### 2. Jalankan OCR Server
Bot membutuhkan OCR untuk membaca captcha. Jalankan file batch ini (akan membuka 3 window Python):
```cmd
start_3_ocr_server.bat
```
*Pastikan window Python tetap terbuka selama bot berjalan.*

### 3. JALANKAN BOT PENDAFTARAN (CORE)
Ini adalah bot utama 'WAR' tiket.
```bash
node antrian-pasarjaya-v52_FINAL_STABLE_OCR.js
```
**Fitur Utama:**
- **Auto War**: Bisa dijadwalkan (misal jam 07:00).
- **Pre-warm**: Otomatis memanaskan koneksi 10 menit sebelum war.
- **Proxy Rotation**: Memutar IP jika terdeteksi rate limit.
- **Circuit Breaker**: Otomatis pause jika server down/error massal.

### 4. Cek Status & Notifikasi Telegram
Setelah bot pendaftaran jalan (atau selesai), jalankan bot cek status untuk memantau keberhasilan dan kirim laporan ke Telegram.
```bash
node cek_status_telegram.js
```
**Fitur:**
- **Auto Check**: Mengecek status setiap 1 menit.
- **Laporan Lengkap**: Mengirim Foto QR, Nama Lengkap, NIK, No Antrian ke Telegram.
- **Smart Validation**: Memastikan status valid (bukan sekedar redirect palsu).

## 📂 Struktur File Penting

| Nama File | Deskripsi |
|-----------|-----------|
| `account_generator.js` | Mengubah txt WhatsApp menjadi `accounts.json`. |
| `accounts.json` | Database akun yang akan didaftarkan. |
| `antrian-pasarjaya-v52_FINAL_STABLE_OCR.js` | **SCRIPT UTAMA**. Bot pendaftaran otomatis. |
| `cek_status_telegram.js` | Bot pemantau status & pengirim notifikasi QR. |
| `start_3_ocr_server.bat` | Script untuk menyalakan 3 server OCR Python. |
| `proxies.txt` | Daftar proxy untuk bypass blocking. |
| `data_mentah_dari_whatsapp.txt` | Input data mentah copy-paste. |
| `reported_success.json` | Database lokal akun yang sudah sukses & lapor. |

## ⚠️ Catatan Penting

- **Parsing Nama**: Fitur terbaru sudah mendukung nama dengan kurung, misal "Sakinah (ANAK PERTAMA)".
- **Log Error**: Cek folder/file `.log` jika ada masalah (network_errors.log, invalid_data.log).
- **Koneksi**: Gunakan internet yang stabil. Jika menggunakan Proxy, pastikan proxy berkualitas bagus (Residensial/ISP).

---
*Created by Antigravity Agent - 2026*
