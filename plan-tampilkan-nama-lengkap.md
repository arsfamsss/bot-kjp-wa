# Plan: Tampilkan Nama Orang Tua + Nama Anak di Rekap Admin & Download

> Dibuat: 27 Feb 2026  
> Status: DRAFT — belum diimplementasi

---

## Latar Belakang Masalah

### Sumber data yang ada:

| File | Isi | Contoh |
|---|---|---|
| `contacts_data.ts` | Phone → Nama Orang Tua saja | `'6283129333818': 'Adnan'` |
| `data_no_kjp.csv` | Nama Orang Tua (Nama Anak) + no_hp + no_kjp | `Adnan (Aina),6283129333818,5049488501834484` |
| DB `data_harian` kolom `nama` | Nama anak yang diketik user saat input | `Aina` |
| DB `data_harian` kolom `no_kjp` | Nomor KJP anak | `5049488501834484` |

### Masalah saat ini:
- **Rekap Admin (chat WA)**: Nama pengirim dari `contacts_data.ts` → hanya nama orang tua (`Adnan`)
- **Download TXT**: Nama pengirim dari DB/WA store → bisa `Unknown`, tidak pakai `contacts_data.ts`
- **Download XLSX**: Nama pengirim dari `getRegisteredUserNameSync` → bisa nama WA acak
- Tidak ada fitur yang menampilkan **nama anak dari CSV** secara eksplisit

### Yang diminta:
> Tampilkan **nama orang tua + nama anak secara lengkap** di rekap admin & download TXT/XLSX  
> Sumber data lengkap ada di `data_no_kjp.csv` — format: `NamaOrangTua (NamaAnak)`

---

## Solusi: Lookup dari `data_no_kjp.csv` via `no_kjp`

### Cara Kerja Lookup:

Setiap data di DB `data_harian` punya `no_kjp`. Di CSV juga ada `no_kjp`.  
→ Kita bisa lookup: **`no_kjp` dari DB → cari di CSV → dapat `"NamaOrangTua (NamaAnak)"`**

```
DB data_harian:
  sender_phone: 6283129333818
  nama: Aina
  no_kjp: 5049488501834484

data_no_kjp.csv:
  Adnan (Aina), 6283129333818, 5049488501834484
                                ↑
                         KEY untuk lookup

Hasil lookup → "Adnan (Aina)"
```

---

## Rencana Perubahan

### Step 1 — Buat Service Baru: `src/services/csvLookupService.ts`

Fungsi baru yang membaca `data_no_kjp.csv` dan menyediakan lookup berdasarkan `no_kjp`:

```typescript
// Membaca CSV sekali saat startup, di-cache di memori
// Map: no_kjp → "NamaOrangTua (NamaAnak)"
const kjpToNameMap: Map<string, string>

// Fungsi utama
getFullNameByKjp(noKjp: string): string | null
// Contoh: getFullNameByKjp('5049488501834484') → 'Adnan (Aina)'

// Fungsi bantu (opsional)
getParentNameByPhone(phone: string): string | null
// Ambil nama orang tua berdasarkan no_hp dari CSV
```

---

### Step 2 — Update `generateExportData()` di `recap.ts` (Download TXT)

**Sebelum:**
```typescript
// tiap item:
txtRows.push(`${senderName} (${item.nama})`);
// senderName = dari DB/WA store (bisa Unknown)
// item.nama = nama anak dari DB
```

**Sesudah:**
```typescript
// tiap item — coba lookup dari CSV dulu via no_kjp:
const fullName = getFullNameByKjp(item.no_kjp);
// fullName = 'Adnan (Aina)' dari CSV, atau null jika tidak ada

txtRows.push(fullName ?? `${senderName} (${item.nama})`);
// Jika ada di CSV → pakai nama lengkap dari CSV
// Jika tidak ada  → fallback ke nama pengirim + nama anak dari DB
```

---

### Step 3 — Update `getGlobalRecap()` di `recap.ts` (Rekap Admin chat WA)

Saat ini nama pengirim ditampilkan di header: `👤 *PENGIRIM 1: Adnan  (0831 2933 3818)*`  
Dan nama anak di bawahnya: `1. Aina`

**Opsi yang bisa dipilih:**

#### Opsi A — Tetap nama pengirim di header, tambah nama CSV di tiap item
```
👤 *PENGIRIM 1: Adnan  (0831 2933 3818)*
📥 Jumlah Data: 3

DHARMAJAYA - Duri Kosambi : 3
   1. Adnan (Aina)        ← dari CSV, bukan hanya "Aina"
   KJP 5049488501834484
   KTP 3174010101800001
   KK  3174011234567890
```

#### Opsi B — Nama pengirim di header tetap, tanpa ubah item (minimal)
Tidak ada perubahan di rekap admin, hanya TXT/XLSX yang diubah.

---

### Step 4 — Update Export XLSX di `wa.ts` + `excelService.ts`

**Sebelum:**
```typescript
const currentName = getRegisteredUserNameSync(row.sender_phone);
const finalSender = currentName || row.sender_name || row.sender_phone;
return { ...row, sender_name: finalSender };
```

**Sesudah:**
```typescript
const fullName = getFullNameByKjp(row.no_kjp);   // lookup CSV via no_kjp
const currentName = getRegisteredUserNameSync(row.sender_phone);
const finalSender = fullName                       // 1. CSV (nama lengkap)
                 || getContactName(row.sender_phone) // 2. contacts_data.ts
                 || currentName                    // 3. WA store
                 || row.sender_name                // 4. DB push_name
                 || row.sender_phone;              // 5. fallback no hp
return { ...row, sender_name: finalSender };
```

---

## Contoh Output Setelah Diubah

### Rekap Admin (chat WA) — Opsi A

```
👑 *LAPORAN DETAIL DATA*
📅 Periode: 27-02-2026 (06.01–23.59 WIB)
📊 Total Keseluruhan: *5* Data

👇 *RINCIAN DATA MASUK:*
----------------------------------------
👤 *PENGIRIM 1: Adnan  (0831 2933 3818)*
📥 Jumlah Data: 3
*DHARMAJAYA - Duri Kosambi* : 3
   1. Adnan (Aina)
   KJP 5049488501834484
   KTP 3174010101800001
   KK  3174011234567890

   2. Adnan (Akbar)
   KJP 504948120004353662
   KTP 3174010202900002
   KK  3174011234567891

   3. Adnan (Alya)
   KJP 5049488508213823
   KTP 3174010303850003
   KK  3174011234567892

----------------------------------------
👤 *PENGIRIM 2: Ma2 Bima Kedaung  (0898 5851 265)*
📥 Jumlah Data: 2
*PASARJAYA - Cengkareng* : 2
   4. Ma2 Bima Kedaung (Bima)
   KK  3174021234567893
   KTP 3174020404900004
   KJP 6006600000004
   01-01-2010

   5. Ma2 Bima Kedaung (Daffa)
   KK  3174021234567894
   KTP 3174020505880005
   KJP 6006600000005
   15-06-2009

────────────────────────────────────
📍 *TOTAL DATA MASUK PER LOKASI:*
   • Cengkareng : 2 data
   • Duri Kosambi : 3 data
────────────────────────────────────
_Akhir laporan (5 data)_
```

---

### Download TXT

```
👑 *LAPORAN DETAIL DATA*
📅 Periode: 27-02-2026 (06.01–23.59 WIB)
📊 Total Keseluruhan: *5* Data

👇 *RINCIAN DATA MASUK:*
────────────────────────────────────
*Gerai DHARMAJAYA - Duri Kosambi*

Adnan (Aina)              ← dari CSV, bukan "Unknown (Aina)"
   📇 KJP 5049488501834484
   🪪 KTP 3174010101800001
   🏠 KK  3174011234567890

Adnan (Akbar)
   📇 KJP 504948120004353662
   🪪 KTP 3174010202900002
   🏠 KK  3174011234567891

Adnan (Alya)
   📇 KJP 5049488508213823
   🪪 KTP 3174010303850003
   🏠 KK  3174011234567892

*Gerai PASARJAYA*

Ma2 Bima Kedaung (Bima)   ← dari CSV, lengkap
KJP 6006600000004
KTP 3174020404900004
KK  3174021234567893
01-01-2010
Cengkareng

Ma2 Bima Kedaung (Daffa)
KJP 6006600000005
KTP 3174020505880005
KK  3174021234567894
15-06-2009
Cengkareng

────────────────────────────────────
📊 *RINGKASAN DATA MASUK:*

👤 *Adnan* (3 data)
   • Duri Kosambi: 3

👤 *Ma2 Bima Kedaung* (2 data)
   • Cengkareng: 2

✅ *Laporan selesai.*
```

---

### Download XLSX — Kolom "Nama"

| Nama | No KJP | No KTP | No KK |
|---|---|---|---|
| Adnan (Aina) | 5049488501834484 | 317401... | 317401... |
| Adnan (Akbar) | 504948120004353662 | 317401... | 317401... |
| Ma2 Bima Kedaung (Bima) | 6006600000004 | 317402... | 317402... |

---

## Pertanyaan Sebelum Implementasi

1. **Opsi rekap admin**: Pakai **Opsi A** (nama anak di item jadi `Adnan (Aina)`) atau **Opsi B** (header tetap, item tetap hanya nama anak)?
2. **Jika no_kjp tidak ada di CSV**: Fallback ke format `NamaOrangTua (NamaAnak)` dari DB saja, atau ada format lain?
3. **Ringkasan TXT** (bagian bawah): Nama pengirim di ringkasan tetap nama orang tua saja (`Adnan`) atau berubah?

---

## File yang Akan Diubah

| File | Perubahan |
|---|---|
| `src/services/csvLookupService.ts` | **BARU** — service lookup CSV by no_kjp |
| `src/recap.ts` | Update `generateExportData()` + opsi `getGlobalRecap()` |
| `src/wa.ts` | Update 3 tempat populate `sender_name` untuk XLSX |
| `src/services/excelService.ts` | Tidak perlu diubah (logic di wa.ts) |
