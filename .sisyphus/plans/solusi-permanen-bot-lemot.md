# Plan: Solusi Permanen Bot-KJP Lemot Saat Modem Restart
**Dibuat**: 26 Februari 2026  
**Tujuan**: Bot tidak CPU spike / lemot lagi saat DNS putus akibat restart modem  
**Scope**: 2 lapisan — (1) DNS stabil di STB, (2) Exponential backoff di kode bot  
**Files yang diubah**: `src/wa.ts`, `/etc/systemd/resolved.conf`, `/root/bot-kjp/ecosystem.config.js` (baru)

---

## Konteks & Root Cause

- **Masalah**: Saat modem restart, DNS ISP di STB mati sementara → bot gagal resolve `web.whatsapp.com` (ENOTFOUND) → reconnect terus-menerus tanpa jeda → CPU 100%, restart 33x, event loop tersumbat → terasa lemot
- **Bukti**: Fintrack-bot kena masalah DNS yang sama TAPI punya exponential backoff → recover sendiri. Bot-kjp tidak punya backoff → CPU spike
- **Solusi**: 2 lapisan defense — DNS fallback + backoff di kode

---

## Guardrails (dari Metis)

- **JANGAN** refactor seluruh `connectToWhatsApp()` — hanya tambah wrapper backoff
- **JANGAN** ganti atau upgrade versi Baileys
- **JANGAN** edit file lain di luar 3 file yang ditentukan
- **WAJIB** backup `src/wa.ts` sebelum edit
- **WAJIB** jalankan `tsc --noEmit` sebelum build
- **WAJIB** `retryCount` dideklarasikan di module scope (di luar fungsi), reset ke 0 saat koneksi open
- **JANGAN** langsung `pm2 delete` tanpa backup ecosystem config lama

---

## Urutan Implementasi (IKUTI URUTAN INI)

### FASE 1 — Backup & Prep
### FASE 2 — Fix DNS di STB (tidak ada downtime bot)
### FASE 3 — Buat ecosystem.config.js (PM2 safeguard)
### FASE 4 — Edit src/wa.ts (tambah backoff)
### FASE 5 — Build & Deploy
### FASE 6 — Verifikasi semua Acceptance Criteria

---

## Task 1: Backup wa.ts sebelum edit apapun

**File**: `src/wa.ts` di VPS `/root/bot-kjp/`  
**Aksi**: Buat salinan backup  

```bash
ssh root@192.168.100.104 "cp /root/bot-kjp/src/wa.ts /root/bot-kjp/src/wa.ts.backup.$(date +%Y%m%d_%H%M%S)"
```

**Verifikasi**:
```bash
ssh root@192.168.100.104 "ls -la /root/bot-kjp/src/wa.ts.backup*"
# Assert: File backup ada dengan timestamp
```

---

## Task 2: Fix DNS di STB — Edit /etc/systemd/resolved.conf

**File target di VPS**: `/etc/systemd/resolved.conf`  
**Aksi**: Tambahkan/uncomment baris DNS dan FallbackDNS

**PENTING**: JANGAN edit `/etc/resolv.conf` langsung — itu symlink yang di-manage systemd. Yang benar edit `/etc/systemd/resolved.conf`.

**Konten yang harus ada** (tambahkan di bawah baris `[Resolve]`):
```ini
[Resolve]
DNS=8.8.8.8 1.1.1.1
FallbackDNS=8.8.4.4 1.0.0.1
```

**Cara edit via SSH**:
```bash
ssh root@192.168.100.104 "
# Backup dulu
cp /etc/systemd/resolved.conf /etc/systemd/resolved.conf.backup

# Tambahkan DNS config (jika belum ada)
sed -i 's/^#DNS=.*/DNS=8.8.8.8 1.1.1.1/' /etc/systemd/resolved.conf
sed -i 's/^#FallbackDNS=.*/FallbackDNS=8.8.4.4 1.0.0.1/' /etc/systemd/resolved.conf

# Jika baris tidak ada sama sekali, tambahkan setelah [Resolve]
grep -q '^DNS=' /etc/systemd/resolved.conf || sed -i '/\[Resolve\]/a DNS=8.8.8.8 1.1.1.1' /etc/systemd/resolved.conf
grep -q '^FallbackDNS=' /etc/systemd/resolved.conf || sed -i '/^DNS=/a FallbackDNS=8.8.4.4 1.0.0.1' /etc/systemd/resolved.conf

# Restart systemd-resolved
systemctl restart systemd-resolved
"
```

**Verifikasi (AC4 & AC5)**:
```bash
ssh root@192.168.100.104 "
echo '=== DNS CONFIG AKTIF ==='
resolvectl status | grep -A5 'Global'

echo '=== TEST RESOLUSI WA ==='
nslookup web.whatsapp.com 8.8.8.8

echo '=== TEST RESOLUSI VIA 1.1.1.1 ==='
nslookup web.whatsapp.com 1.1.1.1
"
# Assert: Output menampilkan 'DNS Servers: 8.8.8.8 1.1.1.1'
# Assert: nslookup mengembalikan IP address, bukan error
```

---

## Task 3: Buat ecosystem.config.js untuk PM2

**File target di VPS**: `/root/bot-kjp/ecosystem.config.js` (FILE BARU)  
**Tujuan**: Batasi restart PM2 agar tidak infinite loop, tambah delay antar restart

**Konten file**:
```javascript
module.exports = {
  apps: [{
    name: 'bot-kjp',
    script: 'dist/index.js',
    cwd: '/root/bot-kjp',
    interpreter: 'node',
    watch: false,
    max_restarts: 15,
    min_uptime: '10s',
    exp_backoff_restart_delay: 100,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/root/bot-kjp/logs/error.log',
    out_file: '/root/bot-kjp/logs/out.log',
    merge_logs: true
  }]
};
```

**Aksi**:
```bash
ssh root@192.168.100.104 "
# Buat folder logs jika belum ada
mkdir -p /root/bot-kjp/logs

# Tulis ecosystem.config.js
cat > /root/bot-kjp/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'bot-kjp',
    script: 'dist/index.js',
    cwd: '/root/bot-kjp',
    interpreter: 'node',
    watch: false,
    max_restarts: 15,
    min_uptime: '10s',
    exp_backoff_restart_delay: 100,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/root/bot-kjp/logs/error.log',
    out_file: '/root/bot-kjp/logs/out.log',
    merge_logs: true
  }]
};
EOF

echo 'ecosystem.config.js dibuat:'
cat /root/bot-kjp/ecosystem.config.js
"
```

**Verifikasi**:
```bash
ssh root@192.168.100.104 "ls -la /root/bot-kjp/ecosystem.config.js && node -e \"require('/root/bot-kjp/ecosystem.config.js'); console.log('Valid JS syntax')\""
# Assert: File ada dan syntax valid
```

---

## Task 4: Edit src/wa.ts — Tambah Exponential Backoff

**File**: `D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS\src\wa.ts`  
**Baris target**: Blok `connection === 'close'` (~baris 368-380)

### Perubahan yang harus dilakukan:

**SEBELUM** (kondisi saat ini, ~baris 376):
```typescript
if (shouldReconnect) connectToWhatsApp();
else console.log('⛔ Sesi logout. Hapus folder auth_info_baileys dan scan ulang.');
```

**SESUDAH** — tambahkan `retryCount` di module scope dan fungsi `reconnectWithBackoff`:

**Langkah 4a**: Tambahkan variabel `retryCount` di module scope (di luar semua fungsi, di bagian atas file setelah imports, atau tepat sebelum fungsi `connectToWhatsApp`):
```typescript
// Exponential backoff untuk reconnect WA
let retryCount = 0;
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 3000;

function reconnectWithBackoff(): void {
  if (retryCount >= MAX_RETRIES) {
    console.log(`⛔ Gagal reconnect setelah ${MAX_RETRIES} percobaan. Menyerah. Restart manual diperlukan.`);
    retryCount = 0;
    return;
  }
  // Exponential backoff: 3s, 6s, 12s, 24s, 48s, lalu cap di 60s
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), 60000);
  retryCount++;
  console.log(`🔄 Reconnect percobaan ${retryCount}/${MAX_RETRIES} dalam ${delay / 1000}s...`);
  setTimeout(() => connectToWhatsApp(), delay);
}
```

**Langkah 4b**: Ubah logika `shouldReconnect` untuk handle lebih banyak kasus:
```typescript
// SEBELUM:
const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

// SESUDAH:
const noReconnectCodes = [
  DisconnectReason.loggedOut,       // 401 - logout manual
  DisconnectReason.forbidden,       // 403 - akun banned
  DisconnectReason.connectionReplaced, // 440 - digantikan instance lain
  DisconnectReason.badSession,      // 500 - session corrupt
];
const shouldReconnect = !noReconnectCodes.includes(statusCode as number);
```

**Langkah 4c**: Ganti baris reconnect:
```typescript
// SEBELUM:
if (shouldReconnect) connectToWhatsApp();

// SESUDAH:
if (shouldReconnect) {
  reconnectWithBackoff();
} else {
  retryCount = 0;
  console.log('⛔ Sesi logout/invalid. Hapus folder auth_info_baileys dan scan ulang.');
}
```

**Langkah 4d**: Reset `retryCount` saat koneksi berhasil. Di blok `connection === 'open'`:
```typescript
// TAMBAHKAN di dalam blok 'open':
} else if (connection === 'open') {
  retryCount = 0; // reset backoff counter
  console.log('✅ WhatsApp Terhubung! Siap menerima pesan.');
}
```

---

## Task 5: Validasi TypeScript Sebelum Build

**Aksi**: Jalankan type check tanpa compile untuk deteksi error lebih awal  
**Lokasi**: Di folder project lokal `D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS`

```bash
cd "D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS" && npx tsc --noEmit
```

**Verifikasi**:
- Exit code harus `0`
- Tidak ada output error TypeScript
- Jika ada error → perbaiki SEBELUM lanjut ke Task 6

---

## Task 6: Build TypeScript

**Aksi**: Compile TypeScript ke JavaScript  
**Lokasi**: Di folder project lokal

```bash
cd "D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS" && npm run build
```

**Verifikasi**:
```bash
# Cek timestamp file dist/wa.js sudah terupdate
ls -la "D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS\dist\wa.js"
# Assert: Timestamp adalah waktu sekarang (baru di-build)
```

---

## Task 7: Deploy ke VPS — Salin file dist/ yang baru

**Aksi**: Upload hasil build ke VPS  
**Tools**: `scp` atau rsync

```bash
# Salin seluruh folder dist ke VPS
scp -r "D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS\dist\*" root@192.168.100.104:/root/bot-kjp/dist/
```

**Verifikasi**:
```bash
ssh root@192.168.100.104 "ls -la --time-style=full-iso /root/bot-kjp/dist/wa.js"
# Assert: Timestamp file adalah waktu deploy sekarang
```

---

## Task 8: Reload PM2 dengan ecosystem.config.js

**Aksi**: Reload bot-kjp menggunakan config baru  
**PENTING**: Gunakan `pm2 reload` (bukan restart/delete) agar lebih aman — bot tidak down terlalu lama

```bash
ssh root@192.168.100.104 "
cd /root/bot-kjp

# Reload dengan ecosystem config baru
pm2 reload ecosystem.config.js --update-env

# Simpan konfigurasi PM2
pm2 save

echo '=== STATUS SETELAH RELOAD ==='
pm2 list
pm2 show bot-kjp
"
```

**Jika `pm2 reload` gagal** (karena process lama tidak kompatibel), gunakan:
```bash
ssh root@192.168.100.104 "
cd /root/bot-kjp
pm2 delete bot-kjp
pm2 start ecosystem.config.js
pm2 save
pm2 list
"
```

---

## Task 9: Verifikasi Final — Semua Acceptance Criteria

Jalankan semua cek berikut dan pastikan SEMUA pass:

```bash
ssh root@192.168.100.104 "
echo '==============================='
echo 'AC1: Cek backoff ada di kode'
echo '==============================='
grep -n 'reconnectWithBackoff\|retryCount\|MAX_RETRIES' /root/bot-kjp/dist/wa.js | head -10

echo ''
echo '==============================='
echo 'AC2: PM2 status'
echo '==============================='
pm2 list

echo ''
echo '==============================='
echo 'AC3: PM2 config max_restarts'
echo '==============================='
pm2 show bot-kjp | grep -E 'restart|backoff|uptime'

echo ''
echo '==============================='
echo 'AC4: DNS aktif (Google/Cloudflare)'
echo '==============================='
resolvectl status | grep -A8 'Global'

echo ''
echo '==============================='
echo 'AC5: DNS resolution test'
echo '==============================='
nslookup web.whatsapp.com 8.8.8.8
nslookup web.whatsapp.com 1.1.1.1

echo ''
echo '==============================='
echo 'AC6: Log bot terbaru (10 baris)'
echo '==============================='
pm2 logs bot-kjp --lines 10 --nostream

echo ''
echo '==============================='
echo 'AC7: CPU usage bot sekarang'
echo '==============================='
ps aux | grep 'bot-kjp\|index.js' | grep -v grep | awk '{print \"CPU: \"\$3\"%, MEM: \"\$4\"%\"}'
"
```

**Assert semua**:
- AC1: Output mengandung `reconnectWithBackoff` dan `retryCount`
- AC2: `bot-kjp` status `online`
- AC3: Nilai `max_restarts`, `restart_delay`, `exp_backoff` terlihat
- AC4: DNS Servers mengandung `8.8.8.8` dan `1.1.1.1`
- AC5: nslookup mengembalikan IP address WA
- AC6: Log tidak ada error baru / bot terhubung
- AC7: CPU di bawah 30%

---

## Task 10: Monitor 30 Menit Setelah Deploy

**Aksi**: Pantau log bot selama 30 menit untuk pastikan tidak ada masalah baru

```bash
ssh root@192.168.100.104 "pm2 logs bot-kjp --lines 30 --nostream"
```

Cek hal berikut:
- [ ] Tidak ada `ENOTFOUND` berulang
- [ ] Tidak ada CPU spike (cek `pm2 monit`)
- [ ] Bot menerima dan merespons pesan dengan normal
- [ ] `restart count` di pm2 tidak bertambah drastis

---

## Ringkasan Perubahan

| File | Perubahan | Tujuan |
|---|---|---|
| `src/wa.ts` | Tambah `retryCount`, `reconnectWithBackoff()`, perbaiki `shouldReconnect` logic | Bot tidak CPU spike saat DNS putus |
| `/etc/systemd/resolved.conf` | Tambah `DNS=8.8.8.8 1.1.1.1` + `FallbackDNS=8.8.4.4 1.0.0.1` | DNS lebih stabil, tidak bergantung modem ISP |
| `/root/bot-kjp/ecosystem.config.js` | File baru — PM2 config dengan `max_restarts`, `restart_delay`, `exp_backoff_restart_delay` | Batasi restart PM2 agar tidak infinite loop |

---

*Plan dibuat oleh Prometheus — 26 Feb 2026*
