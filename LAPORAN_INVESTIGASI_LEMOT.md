# 🔍 LAPORAN INVESTIGASI: BOT KJP TIBA-TIBA LEMOT
**Tanggal Investigasi**: 26 Februari 2026, ~07:10 WIB  
**Server**: STB VPS — `192.168.100.104`  
**Bot**: `bot-kjp` (pm2), lokasi `/root/bot-kjp`

---

## ✅ STATUS INVESTIGASI: ROOT CAUSE DITEMUKAN

---

## 🔴 PENYEBAB UTAMA: DNS Failure → Reconnect Loop → CPU 100%

### Rantai Kejadian (Chain of Events):

```
DNS gagal resolve "web.whatsapp.com"
        ↓
Koneksi WebSocket ke WhatsApp terputus (Error: ENOTFOUND)
        ↓
Bot mencoba reconnect otomatis (Baileys retry logic)
        ↓
Reconnect berhasil → tapi DNS gagal lagi → putus lagi
        ↓
Siklus reconnect terus-menerus (CPU spike 100%)
        ↓
Event loop JavaScript tersaturasi
        ↓
Semua pesan masuk antri, tidak diproses → TERASA LEMOT
```

---

## 📋 DETAIL TEMUAN

### 1. CPU 100% pada Proses Bot
| Keterangan | Detail |
|---|---|
| Proses | `node /root/bot-kjp/dist/index.js` |
| PID | 2215633 |
| CPU Usage | **100% (terus-menerus)** |
| Memory | 9.9% (~193MB) |
| PM2 Restart Count | **33 kali** ⚠️ |
| Uptime | ~7 jam |

> **33x restart** adalah sinyal kuat bahwa bot mengalami crash/reconnect berulang dalam 1 hari terakhir.

---

### 2. Error Log yang Ditemukan

#### ❌ Error #1 — DNS Resolution Gagal (PENYEBAB UTAMA)
```
Error: getaddrinfo ENOTFOUND web.whatsapp.com
Status Code: 408 (Request Timeout)
```
- Terjadi **berulang kali** di log
- DNS server di STB gagal meresolve domain WhatsApp
- Bisa karena: **DNS server ISP bermasalah**, **koneksi internet STB fluktuatif**, atau **rate-limit dari WA**

#### ⚠️ Error #2 — Supabase: Duplicate Key (Minor)
```
PostgreSQL Error 23505: unique_nama_sender_per_day
PostgreSQL Error 23505: unique_ktp_per_processing_day
```
- Data duplikat saat insert ke Supabase
- **Bukan penyebab lemot**, hanya error fungsional

#### ⚠️ Error #3 — Supabase: Row-Level Security Violation (Minor)
```
PostgreSQL Error 42501: new row violates row-level security policy for table "blocked_ktp"
```
- Fungsi `addBlockedKtp` gagal karena RLS Supabase
- **Bukan penyebab lemot**, perlu diperbaiki tersendiri

#### ⚠️ Error #4 — WhatsApp Signal Session Conflict (Minor)
```
Closing open session in favor of incoming prekey bundle
```
- Terjadi saat reconnect berulang (akibat dari masalah #1)
- Session Signal Protocol WA multi-device conflict
- Tidak berbahaya tapi menambah beban proses

---

### 3. Kondisi Server Saat Ini
| Resource | Kondisi | Status |
|---|---|---|
| CPU | **100%** (1 core, load avg 1.29) | 🔴 KRITIS |
| RAM | 744MB used / 1.9GB total | 🟡 Aman (tapi mepet) |
| Disk | **76% used** (4.3GB / 5.7GB) | 🟡 Perlu Dipantau |
| SWAP | 46MB / 958MB used | 🟢 Aman |
| Network | eth0 aktif | 🟢 Aman |
| Uptime Sistem | 10 hari 8 jam | 🟢 Stabil |

> **Disk 76%** — dengan log pm2 yang terus bertambah, bisa penuh dalam beberapa minggu. Perlu dibersihkan secara berkala.

---

### 4. Proses Lain di Server
- `node /root/fintrack-bot/...` — bot lain berjalan normal (CPU 0%, 20x restart)
- Tidak ada proses lain yang mencurigakan

---

## 🎯 KESIMPULAN

> **Bot bukan rusak secara kode.** Masalah adalah **konektivitas DNS/internet intermittent** antara STB dan server WhatsApp, yang memicu loop reconnect tak terkendali sehingga CPU penuh dan bot tidak bisa memproses pesan baru.

---

## 📌 PLAN PERBAIKAN

### Prioritas 1 — Atasi Akar Masalah DNS (SEGERA)
**Tujuan**: Stabilkan koneksi ke `web.whatsapp.com`

- [ ] **1a. Ganti DNS server di STB** dari ISP default ke DNS publik yang lebih stabil:
  - Google DNS: `8.8.8.8` dan `8.8.4.4`
  - Cloudflare DNS: `1.1.1.1` dan `1.0.0.1`
  - Edit `/etc/resolv.conf` di STB
- [ ] **1b. Test konektivitas** ke `web.whatsapp.com` setelah ganti DNS:
  ```bash
  nslookup web.whatsapp.com 8.8.8.8
  curl -I https://web.whatsapp.com
  ```

---

### Prioritas 2 — Tambah Reconnect Backoff di Kode Bot
**Tujuan**: Cegah CPU 100% saat koneksi bermasalah

- [ ] **2a. Implementasi exponential backoff** pada logika reconnect Baileys
  - Saat ini: reconnect langsung → CPU spike
  - Target: tunggu 5s → 10s → 30s → 60s sebelum retry
- [ ] **2b. Tambah batas maksimum reconnect** (misal: max 5x, lalu kirim notif ke admin)
- [ ] **2c. Tambah logging** untuk mendeteksi reconnect storm lebih awal

---

### Prioritas 3 — Perbaiki Error Supabase RLS
**Tujuan**: Fungsi `addBlockedKtp` bisa berjalan normal

- [ ] **3a. Cek policy RLS** di Supabase Dashboard untuk tabel `blocked_ktp`
- [ ] **3b. Tambahkan policy** yang mengizinkan `INSERT` dari service role
  - Atau nonaktifkan RLS di tabel tersebut jika tidak diperlukan

---

### Prioritas 4 — Maintenance Rutin Server
**Tujuan**: Jaga stabilitas jangka panjang

- [ ] **4a. Bersihkan log pm2** yang menumpuk:
  ```bash
  pm2 flush          # hapus semua log
  pm2 install pm2-logrotate  # otomatis rotate log
  ```
- [ ] **4b. Monitor disk** secara berkala (sekarang 76%, batas aman 80%)
- [ ] **4c. Pertimbangkan upgrade RAM** atau optimasi memory jika bot terus berkembang (sekarang mepet di 1.9GB)
- [ ] **4d. Set pm2 max restart limit** agar bot tidak restart terus tanpa batas:
  ```bash
  # Di ecosystem.config.js
  max_restarts: 10,
  restart_delay: 5000
  ```

---

### Prioritas 5 — Monitor & Alerting (Jangka Panjang)
**Tujuan**: Deteksi masalah lebih awal sebelum user merasakan lemot

- [ ] **5a. Tambah health check endpoint** di bot (Express sudah ada, tinggal buat `/health`)
- [ ] **5b. Set alert pm2** jika restart count > 5 dalam 1 jam → kirim notif ke WA admin
- [ ] **5c. Monitor CPU/RAM** dengan tools sederhana (misal: `pm2-logrotate` + custom script)

---

## ⚡ TINDAKAN DARURAT SEKARANG (Tanpa Edit Kode)

Untuk menghentikan lemot **sekarang juga** sambil menunggu perbaikan permanen:

```bash
# 1. SSH ke STB
ssh root@192.168.100.104

# 2. Ganti DNS ke Google/Cloudflare
echo "nameserver 8.8.8.8" > /etc/resolv.conf
echo "nameserver 1.1.1.1" >> /etc/resolv.conf

# 3. Test DNS
nslookup web.whatsapp.com

# 4. Restart bot
pm2 restart bot-kjp

# 5. Pantau log
pm2 logs bot-kjp --lines 50
```

---

*Laporan dibuat otomatis oleh AI investigator — 26 Feb 2026*
