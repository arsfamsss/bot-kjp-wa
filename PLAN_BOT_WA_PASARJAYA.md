# 📋 PLAN: Bot WhatsApp Multi-Mode (Dharmajaya & Pasarjaya)

## 🎯 Tujuan
Membuat **1 bot WhatsApp** yang bisa handle pendaftaran untuk **2 tempat berbeda**:
1. **Dharmajaya** (format 4 baris)
2. **Pasarjaya** (format 5 baris + tanggal lahir)

Bot menggunakan **sistem menu pilihan** di awal untuk menentukan mode pendaftaran.

---

## 📊 Perbandingan Format Input

### Dharmajaya - 4 Baris:
```
Baris 1: Nama
Baris 2: Nomor Kartu
Baris 3: Nomor KTP (NIK)
Baris 4: Nomor KK
```

**Contoh Input:**
```
SITI AMINAH
1234567890123456
3173015005800002
3173010601093454
```

### Pasarjaya - 5 Baris:
```
Baris 1: Nama Lengkap (+ Nama Anak)
Baris 2: Nomor Kartu (16 digit)
Baris 3: Nomor KTP (NIK)
Baris 4: Nomor KK
Baris 5: Tanggal Lahir Anak
```

**Contoh Input:**
```
Wati (Nurjanah QQ RAISYA ALMADINA)
5049488530800823
3173015005800002
3173010601093454
21 november 2012
```

---

## 🎨 Flow User Experience (UX)

### Step 1: Welcome Message (Saat User Pertama Kali Chat)
```
╔══════════════════════════════════╗
║  🛒 BOT PENDAFTARAN SEMBAKO 🛒  ║
╠══════════════════════════════════╣
║                                  ║
║  Silakan pilih lokasi:           ║
║                                  ║
║  1️⃣  DHARMAJAYA                  ║
║  2️⃣  PASARJAYA                   ║
║                                  ║
║  Balas dengan angka 1 atau 2     ║
║                                  ║
╚══════════════════════════════════╝
```

### Step 2a: Jika Pilih "1" (Dharmajaya)
```
╔══════════════════════════════════╗
║  📍 MODE: DHARMAJAYA             ║
╠══════════════════════════════════╣
║                                  ║
║  Kirim data dengan format:       ║
║  (4 baris, tanpa label)          ║
║                                  ║
║  Nama Lengkap                    ║
║  Nomor Kartu                     ║
║  Nomor KTP                       ║
║  Nomor KK                        ║
║                                  ║
║  ─────────────────────────────   ║
║  Contoh:                         ║
║  SITI AMINAH                     ║
║  1234567890123456                ║
║  3173015005800002                ║
║  3173010601093454                ║
║                                  ║
║  Ketik /ganti untuk ganti lokasi ║
╚══════════════════════════════════╝
```

### Step 2b: Jika Pilih "2" (Pasarjaya)
```
╔══════════════════════════════════╗
║  📍 MODE: PASARJAYA              ║
╠══════════════════════════════════╣
║                                  ║
║  Kirim data dengan format:       ║
║  (5 baris, tanpa label)          ║
║                                  ║
║  Nama Lengkap (Nama Anak)        ║
║  Nomor Kartu                     ║
║  Nomor KTP                       ║
║  Nomor KK                        ║
║  Tanggal Lahir Anak              ║
║                                  ║
║  ─────────────────────────────   ║
║  Contoh:                         ║
║  Wati (RAISYA ALMADINA)          ║
║  5049488530800823                ║
║  3173015005800002                ║
║  3173010601093454                ║
║  21 november 2012                ║
║                                  ║
║  Ketik /ganti untuk ganti lokasi ║
╚══════════════════════════════════╝
```

### Step 3: User Kirim Data
Bot akan:
1. Parse berdasarkan mode aktif user
2. Validasi format dan duplikat
3. Simpan ke database (tabel berbeda per lokasi)
4. Kirim konfirmasi sukses/gagal

### Command Tambahan:
- `/ganti` atau `/menu` - Kembali ke menu pilihan lokasi
- `/status` - Cek total data yang sudah didaftarkan
- `/help` - Bantuan

---

## 🗃️ Arsitektur Data

### State Management (Per User)
```typescript
interface UserState {
  phone: string;
  mode: 'dharmajaya' | 'pasarjaya' | null;  // null = belum pilih
  lastActivity: Date;
}
```

### Database Schema

**Tabel 1: dharmajaya_registrations**
```sql
CREATE TABLE dharmajaya_registrations (
  id SERIAL PRIMARY KEY,
  nama VARCHAR(255),
  nomor_kartu VARCHAR(20),
  nik_ktp VARCHAR(16),
  nik_kk VARCHAR(16),
  phone_sender VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Tabel 2: pasarjaya_registrations**
```sql
CREATE TABLE pasarjaya_registrations (
  id SERIAL PRIMARY KEY,
  nama VARCHAR(255),
  nomor_kartu VARCHAR(20),
  nik_ktp VARCHAR(16),
  nik_kk VARCHAR(16),
  tanggal_lahir DATE,
  phone_sender VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Tabel 3: user_states**
```sql
CREATE TABLE user_states (
  phone VARCHAR(20) PRIMARY KEY,
  current_mode VARCHAR(20),  -- 'dharmajaya' | 'pasarjaya'
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔧 Implementasi Teknis

### File yang Perlu Dimodifikasi:

#### 1. `src/state.ts` (Baru)
```typescript
// Menyimpan state user (mode aktif)
const userStates: Map<string, 'dharmajaya' | 'pasarjaya' | null> = new Map();

export function getUserMode(phone: string): string | null {
  return userStates.get(phone) || null;
}

export function setUserMode(phone: string, mode: 'dharmajaya' | 'pasarjaya') {
  userStates.set(phone, mode);
  // Sync ke database
}

export function clearUserMode(phone: string) {
  userStates.set(phone, null);
}
```

#### 2. `src/parser.ts` (Modifikasi)
```typescript
export function parseInput(text: string, mode: 'dharmajaya' | 'pasarjaya') {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  
  if (mode === 'dharmajaya') {
    if (lines.length !== 4) return { error: 'Format salah, harus 4 baris' };
    return {
      nama: lines[0],
      kartu: lines[1].replace(/\s/g, ''),
      ktp: lines[2].replace(/\s/g, ''),
      kk: lines[3].replace(/\s/g, ''),
    };
  }
  
  if (mode === 'pasarjaya') {
    if (lines.length !== 5) return { error: 'Format salah, harus 5 baris' };
    return {
      nama: lines[0],
      kartu: lines[1].replace(/\s/g, ''),
      ktp: lines[2].replace(/\s/g, ''),
      kk: lines[3].replace(/\s/g, ''),
      tanggalLahir: parseDate(lines[4]),
    };
  }
}
```

#### 3. `src/wa.ts` (Modifikasi Handler)
```typescript
async function handleMessage(msg) {
  const phone = msg.sender;
  const text = msg.body.trim();
  
  // Cek command
  if (text === '/ganti' || text === '/menu') {
    clearUserMode(phone);
    return sendWelcomeMenu(phone);
  }
  
  // Cek mode user
  const mode = getUserMode(phone);
  
  if (!mode) {
    // Belum pilih mode
    if (text === '1') {
      setUserMode(phone, 'dharmajaya');
      return sendDharmajayaMenu(phone);
    }
    if (text === '2') {
      setUserMode(phone, 'pasarjaya');
      return sendPasarjayaMenu(phone);
    }
    return sendWelcomeMenu(phone);
  }
  
  // Sudah ada mode, proses input
  const parsed = parseInput(text, mode);
  if (parsed.error) {
    return sendError(phone, parsed.error);
  }
  
  // Simpan ke database
  await saveRegistration(mode, parsed);
  return sendSuccess(phone, parsed);
}
```

---

## ⏱️ Estimasi Waktu (Updated)

| Task | Durasi |
|------|--------|
| Setup state management | 1 jam |
| Update parser (2 mode) | 2 jam |
| Update message handler | 2 jam |
| Buat menu templates | 1 jam |
| Database schema baru | 30 menit |
| Testing | 2 jam |
| Deploy | 30 menit |
| **Total** | **~9 jam** |

---

## ✅ Rekomendasi Final

**1 Bot, 2 Mode dengan Menu Pilihan**

### Kelebihan:
- User tidak bingung (ada panduan jelas)
- Format input bersih (tanpa label ktp/kk)
- Mudah switch antar lokasi dengan `/ganti`
- 1 nomor WA untuk semua
- 1 codebase, mudah maintain

---

## 📝 Detail Implementasi (Opsi A)

### Phase 1: Setup Project Baru
- [ ] Copy folder project KJP
- [ ] Rename ke `BOT-PASARJAYA-WA`
- [ ] Update package.json (nama project)
- [ ] Buat tabel baru di Supabase: `pasarjaya_registrations`

### Phase 2: Modifikasi Parser
- [ ] Update `src/parser.ts`:
  - Validasi 5 baris input
  - Parse tanggal lahir (multi-format):
    - `21-11-2012`
    - `21/11/2012`
    - `21 november 2012`
    - `21 Nov 2012`
  - Validasi format kartu Pasarjaya (16 digit)
  - Validasi NIK (16 digit)
  - Validasi KK (16 digit)

### Phase 3: Update Database Schema
```sql
CREATE TABLE pasarjaya_registrations (
  id SERIAL PRIMARY KEY,
  nama VARCHAR(255) NOT NULL,
  nomor_kartu VARCHAR(20) NOT NULL,
  nik_ktp VARCHAR(16) NOT NULL,
  nik_kk VARCHAR(16) NOT NULL,
  tanggal_lahir DATE NOT NULL,
  phone_sender VARCHAR(20),
  lid_sender VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(nik_ktp, DATE(created_at))  -- 1 NIK per hari
);
```

### Phase 4: Update Reply Messages
- [ ] Update `src/reply.ts` dengan format baru
- [ ] Tampilkan info tanggal lahir di konfirmasi
- [ ] Update menu/help message

### Phase 5: Integrasi dengan Bot War
- [ ] Export data ke format CSV untuk bot war
- [ ] Atau API langsung ke bot war
- [ ] Sinkronisasi data

### Phase 6: Testing
- [ ] Test parser dengan berbagai format tanggal
- [ ] Test validasi duplikat
- [ ] Test flow lengkap end-to-end

### Phase 7: Deploy
- [ ] Deploy ke Termux/Server
- [ ] Monitor log
- [ ] Dokumentasi user

---

## 🔄 Flow Alternatif: Auto-Detect Format

Jika ingin **1 bot handle keduanya**:

```typescript
function detectInputType(lines: string[]): 'kjp' | 'pasarjaya' | 'unknown' {
  if (lines.length === 4) return 'kjp';
  if (lines.length === 5 && isDateFormat(lines[4])) return 'pasarjaya';
  return 'unknown';
}
```

User tidak perlu command khusus, bot otomatis detect berdasarkan jumlah baris.

---

## ⏱️ Estimasi Waktu

| Phase | Durasi |
|-------|--------|
| Phase 1: Setup | 30 menit |
| Phase 2: Parser | 2-3 jam |
| Phase 3: Database | 30 menit |
| Phase 4: Reply | 1 jam |
| Phase 5: Integrasi | 1-2 jam |
| Phase 6: Testing | 1-2 jam |
| Phase 7: Deploy | 30 menit |
| **Total** | **6-9 jam** |

---

## 🚀 Next Step

1. **Konfirmasi** opsi mana yang dipilih (A/B/C)
2. **Konfirmasi** apakah pakai nomor WA sama atau beda
3. **Konfirmasi** schema database Supabase
4. **Mulai implementasi**

---

## 📌 Catatan Penting

- Format nomor kartu Pasarjaya: `5049 4885 3080 082348` (16 digit dengan spasi)
- Bot harus bisa strip spasi dan validasi 16 digit
- Tanggal lahir bisa berbagai format, perlu robust parsing
- Integrasi dengan bot war (`antrian-pasarjaya-v50-war.js`) untuk auto-submit

---

*Dokumen ini dibuat: 21 Januari 2026*
