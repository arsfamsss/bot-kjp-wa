# Plan: Auto-Deploy CSV ke VPS setelah 1_SIAPKAN_DATA_HARIAN.py Selesai

> Dibuat: 27 Feb 2026  
> Status: DRAFT — belum diimplementasi

---

## Masalah Saat Ini

1. `csvContactsSync.ts` di VPS pakai path Windows → CSV tidak ditemukan di Linux
2. File `data_no_kjp.csv` hanya ada di lokal (`D:\BOT\PERSIAPAN HARIAN KJP\`) — tidak pernah dikirim ke VPS
3. Akibatnya: nama orang tua di rekap/download tetap pakai WA cache / Unknown

---

## Solusi

### Komponen yang Dibutuhkan

```
Lokal (Windows)                          VPS Linux (192.168.100.104)
─────────────────────────────────        ──────────────────────────────
1_SIAPKAN_DATA_HARIAN.py                 /root/bot-kjp/data/data_no_kjp.csv
    │                                         ↑
    │ setelah selesai                         │ SCP upload
    ▼                                         │
data_no_kjp.csv ──────────────────────────────┘
    │
    └── (juga simpan ke D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS\data_no_kjp.csv)
```

### Rencana Perubahan

---

## Step 1 — Fix Path CSV di `csvContactsSync.ts`

Ganti path hardcoded Windows → path Linux di VPS:

```typescript
// SEBELUM (salah — path Windows):
const CSV_PATH = path.resolve('D:/BOT/PERSIAPAN HARIAN KJP/data_no_kjp.csv');

// SESUDAH (benar — relatif dari root folder bot):
const CSV_PATH = path.join(__dirname, '../../data/data_no_kjp.csv');
// → resolves ke: /root/bot-kjp/data/data_no_kjp.csv
```

---

## Step 2 — Tambah Auto-Deploy di `1_SIAPKAN_DATA_HARIAN.py`

Tambahkan di bagian **paling akhir** script (setelah `ALL DONE`):

```python
# ─── AUTO DEPLOY CSV KE VPS ────────────────────────────────────────────────
def deploy_csv_to_vps():
    import subprocess, os
    csv_lokal = r"D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv"
    vps_user  = "root"
    vps_host  = "192.168.100.104"
    vps_path  = "/root/bot-kjp/data/data_no_kjp.csv"
    vps_pass  = "openwifi"  # atau pakai SSH key

    print("\n[DEPLOY] Mengirim data_no_kjp.csv ke VPS...")
    try:
        # Pastikan folder /data ada di VPS
        subprocess.run(
            ["ssh", f"{vps_user}@{vps_host}", "mkdir -p /root/bot-kjp/data"],
            check=True, timeout=15
        )
        # Kirim CSV via SCP
        result = subprocess.run(
            ["scp", csv_lokal, f"{vps_user}@{vps_host}:{vps_path}"],
            check=True, timeout=30, capture_output=True, text=True
        )
        print("[DEPLOY] ✅ CSV berhasil dikirim ke VPS!")
        print(f"[DEPLOY] Path di VPS: {vps_path}")
    except subprocess.TimeoutExpired:
        print("[DEPLOY] ⚠️  Timeout — VPS tidak merespons. Deploy manual jika perlu.")
    except subprocess.CalledProcessError as e:
        print(f"[DEPLOY] ❌ Gagal: {e.stderr}")
    except FileNotFoundError:
        print("[DEPLOY] ⚠️  SCP tidak ditemukan. Pastikan OpenSSH terinstall di Windows.")

deploy_csv_to_vps()
```

> ⚠️ Setelah CSV dikirim, `csvContactsSync.ts` di VPS akan otomatis detect perubahan
> (mtime berubah) dalam 60 detik → update memory → langsung aktif tanpa restart bot.

---

## Step 3 — Buat Script Manual Deploy CSV

File baru: `D:\BOT\PERSIAPAN HARIAN KJP\DEPLOY_CSV_KE_VPS.bat`

```bat
@echo off
echo ========================================
echo    DEPLOY CSV KE VPS (MANUAL)
echo ========================================
echo.
echo [1/2] Membuat folder /data di VPS jika belum ada...
ssh root@192.168.100.104 "mkdir -p /root/bot-kjp/data"

echo.
echo [2/2] Mengirim data_no_kjp.csv ke VPS...
scp "D:\BOT\PERSIAPAN HARIAN KJP\data_no_kjp.csv" root@192.168.100.104:/root/bot-kjp/data/data_no_kjp.csv

if %errorlevel% equ 0 (
    echo.
    echo ✅ CSV berhasil dikirim ke VPS!
    echo    Bot akan auto-sync dalam maks 60 detik.
) else (
    echo.
    echo ❌ Gagal! Cek koneksi ke VPS.
)
echo.
pause
```

---

## Step 4 — Buat Folder `data/` di VPS

Jalankan sekali di VPS:
```bash
mkdir -p /root/bot-kjp/data
```

---

## Alur Setelah Implementasi

```
Admin jalankan 1_SIAPKAN_DATA_HARIAN.py
    │
    ├─ Input data, pilih lokasi, dll (interaktif seperti biasa)
    │
    ├─ Script selesai → "ALL DONE"
    │
    └─ deploy_csv_to_vps() otomatis jalan
           │
           ├─ SCP: data_no_kjp.csv → /root/bot-kjp/data/ di VPS
           │
           └─ Dalam 60 detik:
                  csvContactsSync.ts detect mtime berubah
                  → parse CSV baru
                  → updateContactsMap()
                  → getContactName() langsung pakai data terbaru ✅
                  → Tanpa restart bot!
```

---

## File yang Akan Diubah/Dibuat

| File | Aksi | Keterangan |
|---|---|---|
| `src/services/csvContactsSync.ts` | **Diubah** | Fix path CSV ke path Linux |
| `D:\BOT\PERSIAPAN HARIAN KJP\1_SIAPKAN_DATA_HARIAN.py` | **Diubah** | Tambah `deploy_csv_to_vps()` di akhir |
| `D:\BOT\PERSIAPAN HARIAN KJP\DEPLOY_CSV_KE_VPS.bat` | **Baru** | Script manual deploy jika butuh |

---

## Syarat Agar SCP Berjalan dari Windows

- OpenSSH harus terinstall di Windows (biasanya sudah ada di Windows 10/11)
- SSH key lokal harus sudah authorize di VPS, atau pakai password
- Koneksi ke VPS harus tersedia saat script dijalankan

> Jika pakai password setiap kali (tidak nyaman), bisa setup SSH key sekali agar tidak perlu ketik password lagi.
