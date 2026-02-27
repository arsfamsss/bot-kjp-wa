### Layout 2 Kolom (6 Kolom Tabel)
- Untuk membuat layout 2 kolom berdampingan di ReportLab, pendekatan paling stabil adalah menggunakan satu  dengan 6 kolom: .
- Data dipisahkan menjadi  dan  (biasanya ).
- Loop dilakukan sebanyak  kali untuk menyusun baris tabel yang berisi data dari kedua bagian.
- Styling  harus diperluas ke kolom 0-5.
- Zebra stripes diaplikasikan per baris tabel (), sedangkan highlight milestone (misal baris ke-50) dicek berdasarkan data ID di dalam cell tersebut.
### Layout 2 Kolom (6 Kolom Tabel)
- Untuk membuat layout 2 kolom berdampingan di ReportLab, pendekatan paling stabil adalah menggunakan satu Table dengan 6 kolom: [No, HP, Nama, No, HP, Nama].
- Data dipisahkan menjadi left_part dan right_part (biasanya half = (len(data) + 1) // 2).
- Loop dilakukan sebanyak half kali untuk menyusun baris tabel yang berisi data dari kedua bagian.
- Styling TableStyle harus diperluas ke kolom 0-5.
- Zebra stripes diaplikasikan per baris tabel (r_idx), sedangkan highlight milestone (misal baris ke-50) dicek berdasarkan data ID di dalam cell tersebut.
