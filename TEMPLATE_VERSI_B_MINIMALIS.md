# 📱 TEMPLATE VERSI B - MINIMALIS

> **Gaya:** Super singkat, to the point, tidak banyak basa-basi
> **Cocok untuk:** User yang sudah terbiasa, tidak perlu banyak penjelasan

---

## 🏠 MENU UTAMA

```
🛒 *SEMBAKO BERSUBSIDI*

1 = Daftar
2 = Cek
3 = Hapus
4 = Bantuan
```

---

## 1️⃣ MENU DAFTAR

### Pilih Lokasi
```
📍 *LOKASI?*

1 = Pasarjaya (5 baris)
2 = Dharmajaya (4 baris)
0 = Batal
```

### Pilih Pasarjaya
```
✅ *PASARJAYA*

Kirim 5 baris:
Nama
No Kartu
No KTP
No KK
Tgl Lahir (DD-MM-YYYY)

Contoh:
Siti
5049488500001234
3171234567890123
3171098765432109
15-08-1975
```

### Pilih Dharmajaya
```
✅ *DHARMAJAYA*

Kirim 4 baris:
Nama
No Kartu
No KTP
No KK

Contoh:
Siti
5049488500001234
3171234567890123
3171098765432109
```

---

## ✅ DATA SUKSES

```
✅ *OK - 3 orang*

Total hari ini: 5 orang

CEK = lihat data
BATAL = batalkan
```

---

## ⚠️ DATA PARTIAL

```
⚠️ *2 OK, 1 GAGAL*

✅ Siti, Budi

❌ Agus
→ KTP kurang digit (14/16)

Kirim ulang yg salah
```

---

## ❌ DATA GAGAL

```
❌ *GAGAL*

Kartu harus awali 504948

Contoh benar:
5049488500001234
```

---

## 2️⃣ CEK DATA

### Ada Data
```
📋 *DATA 24-01-2026*

1. Siti (5049...1234) 📍Kedoya
2. Budi (5049...5678) 📍DuKos
3. Agus (5049...9012) 📍DuKos

HAPUS 1 = hapus data 1
```

### Kosong
```
📋 *KOSONG*

Belum ada data hari ini.

1 = Daftar
```

---

## 3️⃣ HAPUS

```
🗑️ *HAPUS*

1. Siti (5049...1234)
2. Budi (5049...5678)
3. Agus (5049...9012)

Ketik: 1 atau 1,2,3
0 = Batal
```

### Hapus OK
```
✅ *DIHAPUS*

Budi sudah dihapus.
Sisa: 2 orang
```

### Hapus Gagal
```
❌ *GAGAL*

Nomor tidak ada.
CEK dulu datanya.
```

---

## ⏪ BATAL

### OK
```
✅ *DIBATALKAN*

2 orang dihapus:
Siti, Budi
```

### Gagal
```
❌ *TIDAK BISA*

Lewat 30 menit.
Pakai HAPUS.
```

---

## 4️⃣ BANTUAN

```
❓ *BANTUAN*

🕐 Buka: 06.01-04.00 WIB

*Format 4 baris:*
Nama, Kartu, KTP, KK

*Format 5 baris:*
Nama, Kartu, KTP, KK, TglLahir

*Aturan:*
• 1 kartu = 1x/bulan
• 1 KTP = 1x/hari

MENU = kembali
```

---

## ⛔ BOT TUTUP

```
⛔ *TUTUP*

04.01-06.00 WIB
Buka: 06.01 WIB
```

---

## 📱 KIRIM GAMBAR

```
❌ *GAMBAR*

Kirim TEKS, bukan foto.
```

---

## 🔐 VERIFIKASI HP

### Minta Nomor
```
👋 *HALO*

Ketik nama dan HP:
Siti 08123456789
```

### OK
```
✅ *OK*

HP: 08123456789
Silakan daftar.
```

---

## ❌ ERROR

### Kartu Salah
```
❌ Kartu harus awali 504948
```

### Digit Kurang
```
❌ KTP harus 16 digit (Anda: 14)
```

### Duplikat
```
⚠️ Kartu sudah terdaftar bulan ini
```

### Urutan Salah
```
❌ Urutan: Nama→Kartu→KTP→KK
```

### Format Kurang
```
❌ Kurang baris. Harus 4/5 baris.
```

### Tanggal Salah
```
❌ Format: DD-MM-YYYY (15-08-1975)
```

---

## 📊 PERBANDINGAN

| Versi A | Versi B |
|---------|---------|
| Detail | Singkat |
| 10-20 baris | 3-7 baris |
| Banyak emoji | Emoji minimal |
| Penjelasan lengkap | Langsung inti |
| Untuk pemula | Untuk yg sudah paham |
