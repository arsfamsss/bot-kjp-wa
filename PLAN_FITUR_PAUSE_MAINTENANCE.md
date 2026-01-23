# 📋 PLANNING: Fitur PAUSE / RESUME / MAINTENANCE

## 🎯 Tujuan
Menambahkan fitur untuk Admin agar bisa:
- **PAUSE** - Menonaktifkan bot sementara (tidak terima pesan user)
- **RESUME** - Mengaktifkan kembali bot
- **MAINTENANCE** - Mode khusus dengan pesan custom maintenance

---

## 📊 Analisis Kode Saat Ini

### Yang Sudah Ada:
1. **`isSystemClosed()`** di `time.ts` - Jam tutup otomatis (04.01-06.00 WIB)
2. **Admin Check** - `ADMIN_PHONES` set untuk validasi admin
3. **State Management** - `state.ts` sudah punya pattern Map untuk state

### Yang Perlu Ditambah:
1. **Global Bot Status** - Variable untuk status bot (ACTIVE/PAUSED/MAINTENANCE)
2. **Command Handler** - `/PAUSE`, `/RESUME`, `/MAINTENANCE`
3. **Filter di awal** - Cek status sebelum proses pesan user

---

## 🔧 Implementasi

### 1️⃣ Perubahan di `state.ts`
```typescript
// Tambahkan type dan state global
export type BotStatus = 'ACTIVE' | 'PAUSED' | 'MAINTENANCE';

// Status bot (singleton) - Default aktif
let currentBotStatus: BotStatus = 'ACTIVE';
let maintenanceMessage: string = '';

// Getter & Setter
export function getBotStatus(): BotStatus {
    return currentBotStatus;
}

export function setBotStatus(status: BotStatus, customMsg?: string): void {
    currentBotStatus = status;
    if (customMsg) maintenanceMessage = customMsg;
}

export function getMaintenanceMessage(): string {
    return maintenanceMessage || 'Sistem sedang dalam perbaikan.';
}
```

### 2️⃣ Perubahan di `wa.ts`

#### A. Import fungsi baru
```typescript
import { getBotStatus, setBotStatus, getMaintenanceMessage } from './state';
```

#### B. Tambah Command Handler Admin (SEBELUM proses pesan lain)
```typescript
// Di dalam loop messages.upsert, setelah cek isAdmin

// --- ADMIN COMMANDS: PAUSE/RESUME/MAINTENANCE ---
if (isAdmin) {
    if (normalized === 'PAUSE' || normalized === '/PAUSE' || normalized === 'STOP') {
        setBotStatus('PAUSED');
        await sock.sendMessage(remoteJid, { 
            text: '🔴 *BOT DINONAKTIFKAN*\n\nSemua pesan user akan diabaikan.\nKetik RESUME untuk aktifkan kembali.' 
        });
        continue;
    }
    
    if (normalized === 'RESUME' || normalized === '/RESUME' || normalized === 'START') {
        setBotStatus('ACTIVE');
        await sock.sendMessage(remoteJid, { 
            text: '🟢 *BOT DIAKTIFKAN KEMBALI*\n\nBot siap menerima pesan.' 
        });
        continue;
    }
    
    if (normalized.startsWith('MAINTENANCE') || normalized.startsWith('/MAINTENANCE')) {
        // Format: MAINTENANCE [pesan custom]
        const customMsg = rawTrim.replace(/^\/?(MAINTENANCE|maintenance)\s*/i, '').trim();
        setBotStatus('MAINTENANCE', customMsg || undefined);
        await sock.sendMessage(remoteJid, { 
            text: `🟡 *MODE MAINTENANCE AKTIF*\n\nPesan ke user:\n"${getMaintenanceMessage()}"\n\nKetik RESUME untuk aktifkan kembali.` 
        });
        continue;
    }
    
    // Cek status bot saat ini
    if (normalized === 'STATUS' || normalized === '/STATUS') {
        const status = getBotStatus();
        const emoji = status === 'ACTIVE' ? '🟢' : status === 'PAUSED' ? '🔴' : '🟡';
        await sock.sendMessage(remoteJid, { 
            text: `${emoji} *STATUS BOT: ${status}*` 
        });
        continue;
    }
}

// --- FILTER: Tolak user jika bot tidak aktif ---
const botStatus = getBotStatus();
if (!isAdmin && botStatus !== 'ACTIVE') {
    if (botStatus === 'PAUSED') {
        // Diam saja, tidak kirim balasan (silent ignore)
        continue;
    } else if (botStatus === 'MAINTENANCE') {
        await sock.sendMessage(remoteJid, {
            text: `🟡 *SISTEM DALAM MAINTENANCE*\n\n${getMaintenanceMessage()}\n\nMohon tunggu beberapa saat.`
        });
        continue;
    }
}
```

---

## 📝 Command yang Tersedia

| Command | Fungsi | Contoh |
|---------|--------|--------|
| `PAUSE` atau `/PAUSE` | Matikan bot (silent) | `PAUSE` |
| `RESUME` atau `/RESUME` | Aktifkan bot | `RESUME` |
| `MAINTENANCE [pesan]` | Mode maintenance + pesan | `MAINTENANCE Sedang update sistem` |
| `STATUS` | Cek status bot | `STATUS` |

---

## 🔄 Alur Kerja

```
User kirim pesan
       ↓
Cek: Apakah Admin?
       ↓
   ┌───┴───┐
   │  Ya   │  → Proses command PAUSE/RESUME/MAINTENANCE/STATUS
   └───────┘    ↓
   │  Tidak │  → Cek getBotStatus()
   └───────┘
       ↓
┌──────────────────┐
│ ACTIVE          │ → Proses normal
│ PAUSED          │ → Abaikan (tidak reply)
│ MAINTENANCE     │ → Reply pesan maintenance
└──────────────────┘
```

---

## ⚠️ Catatan Penting

1. **Status TIDAK persistent** - Jika bot restart, status kembali ke ACTIVE
2. **Solusi persistent (opsional)**:
   - Simpan ke file JSON lokal
   - Simpan ke Supabase
   
3. **Admin tetap bisa kirim command** saat bot PAUSED/MAINTENANCE

---

## 📁 File yang Diubah

1. `src/state.ts` - Tambah type & fungsi getBotStatus/setBotStatus
2. `src/wa.ts` - Tambah command handler & filter

---

## ✅ Estimasi Waktu: 15-30 menit

Apakah Anda setuju dengan planning ini? Jika ya, saya akan langsung implementasi.
