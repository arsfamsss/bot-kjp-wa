# 📱 SARAN TEMPLATE BALASAN BOT WHATSAPP

> Template balasan yang **simple, jelas, dan mudah dimengerti** oleh ibu-ibu dan orang tua.

---

## ✅ YANG SUDAH DIPERBAIKI

### FAQ Sekarang Sudah Lengkap
Format Pasarjaya (5 baris + tanggal lahir) sudah ditambahkan di `src/config/messages.ts`.

---

## 🎯 PRINSIP DESAIN PESAN

| Prinsip | Penjelasan |
|---------|------------|
| **Singkat** | Max 15 baris per pesan |
| **Jelas** | Bahasa sehari-hari, hindari istilah teknis |
| **Visual** | Emoji = penanda, bukan hiasan |
| **Instruksi** | Jelas dan eksplisit |

---

## 📱 SARAN TEMPLATE

### 1. Menu Utama (Lebih Ramah)
```
🛒 *DAFTAR ANTREAN SEMBAKO*

Halo Bapak/Ibu! 👋
Ketik *angka* di bawah ini:

1 → Daftar antrean
2 → Cek data saya
3 → Hapus data
4 → Butuh bantuan

Contoh: ketik *1* lalu kirim
```

---

### 2. Pilihan Lokasi
```
📍 *PILIH LOKASI*

Ketik angka:

1 → Dharmajaya (4 baris)
2 → Pasarjaya (5 baris)

⚠️ Format berbeda, pilih yang sesuai
```

---

### 3. Format Daftar - DHARMAJAYA
```
📋 *CARA DAFTAR - DHARMAJAYA*

Kirim data dengan urutan:

1. Nama
2. No Kartu
3. No KTP
4. No KK

━━━━━━━━━━━━━━━━━━━━
✅ *CONTOH:*

Budi Santoso
5049488500001111
3173444455556666
3173555566667777
━━━━━━━━━━━━━━━━━━━━

💡 Langsung kirim seperti contoh di atas
```

---

### 4. Format Daftar - PASARJAYA
```
📋 *CARA DAFTAR - PASARJAYA*

Kirim data dengan urutan:

1. Nama
2. No Kartu
3. No KTP
4. No KK
5. Tanggal Lahir

━━━━━━━━━━━━━━━━━━━━
✅ *CONTOH:*

Budi Santoso
5049488500001111
3173444455556666
3173555566667777
15-08-1985
━━━━━━━━━━━━━━━━━━━━

💡 Langsung kirim seperti contoh di atas
```

---

### 5. Balasan Sukses
```
✅ *DATA BERHASIL DISIMPAN*

📊 Diterima: 3 orang
📋 Total hari ini: 5 orang

Terima kasih 🙏

━━━━━━━━━━━━━━━━━━━━
⚠️ Pastikan data sudah BENAR
Kesalahan = ditolak saat ambil
━━━━━━━━━━━━━━━━━━━━

Ketik *CEK* untuk lihat data
Ketik *BATAL* jika mau batalkan
```

---

### 6. Balasan Sebagian Berhasil
```
⚠️ *SEBAGIAN DATA DISIMPAN*

✅ Berhasil: 2 orang
❌ Gagal: 1 orang

Yang berhasil:
1. Budi Santoso
2. Siti Aminah

━━━━━━━━━━━━━━━━━━━━
Yang perlu diperbaiki:

👤 *Agus Susanto*
⚠️ No KTP kurang digit (15, harusnya 16)

💡 Kirim ulang data yang benar
```

---

### 7. Error: Format Salah
```
❌ *DATA BELUM BISA DIPROSES*

Formatnya kurang tepat 🙏

━━━━━━━━━━━━━━━━━━━━
*Masalahnya:*
• No Kartu harus 16-18 digit
• No KTP harus 16 digit
• No KK harus 16 digit
━━━━━━━━━━━━━━━━━━━━

*Contoh yang benar:*

Budi
5049488500001111
3173444455556666
3173555566667777

💡 Coba kirim ulang ya
```

---

### 8. Error: Data Duplikat
```
⚠️ *DATA SUDAH PERNAH DIDAFTAR*

Data *Budi Santoso* sudah terdaftar hari ini.

📋 Data tercatat:
• Nama: Budi Santoso
• Kartu: 5049...1111
• Jam: 08:30

💡 Ketik *HAPUS* jika mau ganti data
```

---

### 9. Error: Data Tidak Lengkap
```
❌ *DATA TIDAK LENGKAP*

Harus 4 baris per orang:
1. Nama
2. No Kartu
3. No KTP
4. No KK

💡 Coba kirim ulang ya
```

---

### 10. Error: Di Luar Jam
```
⏰ *MOHON MAAF*

Pendaftaran sedang tutup 🙏

🟢 Buka: 06.01 - 04.00 WIB
🔴 Tutup: 04.01 - 06.00 WIB

Silakan kirim setelah jam 06.01
```

---

### 11. Error: Urutan Salah
```
❌ *URUTAN DATA SALAH*

Urutannya terbalik 🙏

*Yang benar:*
1. Nama (huruf)
2. No Kartu (16-18 digit)
3. No KTP (16 digit)
4. No KK (16 digit)

💡 Coba kirim ulang ya
```

---

### 12. Cek Data
```
📋 *DATA ANDA HARI INI*

Total: 3 orang

1. Budi Santoso
   📇 5049...1111 | 08:30

2. Siti Aminah
   📇 5049...2222 | 08:32

3. Agus Susanto
   📇 5049...3333 | 08:35

━━━━━━━━━━━━━━━━━━━━
Ketik *HAPUS 1* untuk hapus data
```

---

### 13. Hapus Data
```
🗑️ *PILIH DATA YANG MAU DIHAPUS*

1. Budi Santoso (5049...1111)
2. Siti Aminah (5049...2222)
3. Agus Susanto (5049...3333)

━━━━━━━━━━━━━━━━━━━━
Ketik nomor: *1* atau *1,2,3*
```

---

### 14. Hapus Berhasil
```
✅ *DATA BERHASIL DIHAPUS*

Yang dihapus:
• Budi Santoso

Sisa data: 2 orang

Ketik *CEK* untuk lihat data
```

---

### 15. Batal Berhasil
```
✅ *DATA DIBATALKAN*

Yang dibatalkan:
• Agus Susanto (5 menit lalu)

Sisa data: 2 orang
```

---

### 16. Batal Gagal (Lewat 30 Menit)
```
⏰ *TIDAK BISA DIBATALKAN*

Data sudah lebih dari 30 menit.

💡 Gunakan *HAPUS* untuk hapus data
```

---

### 17. Pesan Tidak Dikenali
```
🤔 *MAAF, TIDAK MENGERTI*

Ketik *MENU* untuk lihat pilihan
Ketik *4* untuk bantuan

Atau langsung kirim data pendaftaran
```

---

## 📝 FILE YANG PERLU DIEDIT

| File | Keterangan |
|------|------------|
| `src/config/messages.ts` | ✅ FAQ sudah diperbaiki |
| `src/reply.ts` | Balasan sukses/error |
| `src/wa.ts` | Handler perintah |

---

*Dibuat: 24 Januari 2026*
