# Nama yang Ditampilkan di Rekap & Download

> Dibuat: 27 Feb 2026  
> Topik: Dari mana sumber nama yang muncul saat admin cek rekap, download TXT, dan download XLSX?

---

## Ringkasan Cepat

| Fitur | Nama Pengirim (sender) | Nama Anak/Data |
|---|---|---|
| CEK rekap (user) | ❌ tidak tampil | ✅ dari DB kolom `nama` |
| Rekap global admin (chat WA) | contacts_data → DB → WA | dari DB kolom `nama` |
| Download TXT | DB `lid_phone_map` → WA store | dari DB kolom `nama` |
| Download XLSX | field `sender_name` | dari DB kolom `nama` |

**Kolom `nama` di DB = nama yang diketik user sendiri saat input data.**  
Bukan nama profil WA, bukan dari CSV.

---

## Detail Per Fitur

---

### 1. CEK Rekap (user ketik CEK)

- **Nama anak/data** → diambil dari DB kolom `nama` (apa adanya seperti yang user ketik)
- Nama pengirim **tidak ditampilkan** di sini
- File kode: `src/recap.ts` → fungsi `buildReplyForTodayRecap()`

---

### 2. Rekap Global Admin (via chat WA)

Nama pengirim ditampilkan dengan **urutan prioritas**:

```
1. contacts_data.ts  ← PRIORITAS TERTINGGI (hardcoded manual di kode)
2. DB lid_phone_map (kolom push_name)  ← jika tidak ada di kontak manual
3. Store WA live (push_name dari WA)  ← jika tidak ada di DB
```

Format tampil: `👤 PENGIRIM 1: Adnan  (0831 2933 3818)`

- File kode: `src/recap.ts` → fungsi `getGlobalRecap()`
- Kontak hardcoded ada di: `src/contacts_data.ts`

---

### 3. Download TXT

Nama pengirim diambil dari:

```
1. DB lid_phone_map (push_name)  ← cek DB dulu
2. WA Store (nameLookup callback)  ← fallback jika tidak ada di DB
3. 'Unknown'  ← jika tidak ditemukan sama sekali
```

> ⚠️ **PERHATIAN**: Download TXT **TIDAK pakai** `contacts_data.ts`!  
> Beda dengan rekap global admin yang cek kontak hardcoded dulu.

Format tiap baris data: `Adnan (Nama Anak KJP)`  
→ *nama pengirim* + *(nama terdaftar di DB)*

- File kode: `src/recap.ts` → fungsi `generateExportData()`

---

### 4. Download XLSX (Excel)

Kolom **"Nama"** di Excel menggunakan logika:

```typescript
item.sender_name && item.sender_name !== item.nama
    ? `${item.sender_name} (${item.nama})`   // "Adnan (Nama Anak)"
    : (item.nama || "")                       // hanya nama anak saja
```

- Kalau `sender_name` ada dan berbeda dari `nama` → tampil `Pengirim (Nama Anak)`
- Kalau tidak ada `sender_name` → hanya tampil nama anak dari DB

- File kode: `src/services/excelService.ts`

---

## Kesimpulan Penting

1. **Nama anak/penerima KJP** → selalu dari DB kolom `nama`, yaitu yang diketik user saat daftar
2. **Nama pengirim** → sumbernya berbeda-beda tergantung fitur:
   - Rekap admin WA: contacts_data.ts dulu → DB → WA
   - TXT: DB dulu → WA *(skip contacts_data.ts!)*
   - XLSX: field `sender_name`
3. **Nama profil WA** hanya dipakai sebagai **fallback terakhir**, bukan sumber utama
4. **Nama di CSV** (`data_no_kjp.csv`) tidak dipakai di rekap manapun
