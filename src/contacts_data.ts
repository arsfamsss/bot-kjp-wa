// contacts_data.ts
// Data awal (seed) dari entri manual — akan di-merge/override oleh CSV sync saat startup
// Gunakan updateContactsMap() untuk update dari luar (csvContactsSync.ts)

// ─── In-memory Map (sumber kebenaran runtime) ────────────────────────────────
const contactsMap = new Map<string, string>([
    ['6283129333818', 'Adnan'],
    ['6283129333822', 'Adnan Ulfah'],
    ['6287785034166', 'Alika Hafiz'],
    ['6289653029561', 'Alyssa Avicena'],
    ['6283135783133', 'Ammar Danish Fb Cakung'],
    ['6289514785860', 'Anasthasi Rizkita Fb'],
    ['6285591827687', 'Anggoro Mama Naya'],
    ['6281292192146', 'Annisa Min 7'],
    ['6285157552308', 'Azzura'],
    ['628551856323', 'Bahira'],
    ['6288298357410', 'Bening'],
    ['6288976870378', 'Boniyah'],
    ['6281210352071', 'Bu De Susu Kacang'],
    ['6281382576022', 'Clei 09 Kapuk'],
    ['6285213820456', 'Denis'],
    ['6285280885800', 'Denis 2'],
    ['6289509898474', 'Denti'],
    ['6283170623970', 'Desi Susanti Fian Fb Cakung'],
    ['6289633628259', 'Dewi Timbul'],
    ['62887433302100', 'Dhafin 09'],
    ['6281240313573', 'Dila Tri'],
    ['6285811359637', 'Dina Ely'],
    ['6285886970323', 'Dini Afif'],
    ['6281355330105', 'Dini Dapur Dinwati Cakpul'],
    ['6285771269729', 'Dirta Yasa Rt 02'],
    ['6281293888674', 'Eka Sati'],
    ['6285816868005', 'El Zavier Avicena'],
    ['6285861459682', 'Ely Afif'],
    ['6285889988739', 'Eva Fb Pulogadung'],
    ['6281906667631', 'Fathir Min 7'],
    ['6285641411818', 'Fendi'],
    ['6288295121177', 'Fitri Khairunnisa Fb Cakung'],
    ['6289529182717', 'Galih Danis'],
    ['628131860698', 'Hanna Rizal'],
    ['6282260195263', 'Mama Rizal'],
    ['6285697713241', 'Heri Pulogadung Cust Nurul'],
    ['6287765483181', 'Iis Dawis Rt 04'],
    ['6281295889727', 'Kak Erna'],
    ['6285179558485', 'Kayla'],
    ['6281295420827', 'Keichi'],
    ['62895326310387', 'Kiki Afif'],
    ['6287726466827', 'Lia'],
    ['6285881272330', 'Ma2 Afif Min 7'],
    ['628985851265', 'Ma2 Bima Kedaung'],
    ['6285775361062', 'Ma2 Fahri Kedaung'],
    ['6285693378288', 'Mahardika 12 Kka'],
    ['6285281006717', 'Mak Dea Rizky'],
    ['6281318392885', 'Mamah Utet'],
    ['6287895658425', 'Mamanya Bagas'],
    ['6285771623646', 'Maryam'],
    ['6282125342113', 'Mbak Nik'],
    ['6281389066191', 'Mbak Sri Maheni'],
    ['62895326108964', 'Mbak Sum'],
    ['6285693257520', 'Mbak Yuni'],
    ['6285361621600', 'Melly Fb Cakpul'],
    ['6281319086066', 'Mi2 Maya'],
    ['6281212949820', 'Miftah'],
    ['6285280382989', 'Moza'],
    ['6285148221078', 'Nabilah 12 Kka'],
    ['6285894098159', 'Nabilah Nurbaiti Fb Cakpul'],
    ['6285179584852', 'Nadia'],
    ['6281808124933', 'Nakay Mart'],
    ['6285641651549', 'Naufal 12 Kka'],
    ['6281212985108', 'Nauren 12 Kka'],
    ['6288808569196', 'Nesya Avicena'],
    ['6285779618481', 'Nita Bilqis FB Kosambi'],
    ['62895333975796', 'Nurhayati 12 Kka'],
    ['6285693344098', 'Nurul Fb Pulogadung'],
    ['6282385963155', 'Pelangi'],
    ['6287888020030', 'Pia Mama Irul'],
    ['6281296876667', 'Prapti Arie Witanto Fb'],
    ['6285882236237', 'Rafa 12 Kka'],
    ['628568777720', 'Rayhan 12 Kka 1A'],
    ['6281284462255', 'Revalia Fb Cakung'],
    ['6289628398184', 'Reza Afif'],
    ['6283876584682', 'Rima Afif'],
    ['6281383172438', 'Rindiani'],
    ['6283806605586', 'Rosa Efari Fb'],
    ['6287889975309', 'Royati Fb Pulogadung'],
    ['6281385258004', 'Rya Rt 25'],
    ['628988673667', 'Samsiyah Syam'],
    ['628816171722', 'Santi Sadiah'],
    ['62895322275039', 'Selfi Rono'],
    ['6281953438815', 'Selly'],
    ['6282169643265', 'srindayani Linda'],
    ['62881024448132', 'Syarifah Kembar'],
    ['6281291347381', 'Tamy'],
    ['6289681775441', 'Tante Bakso'],
    ['6288299913506', 'Tante Carlissa'],
    ['6285718090272', 'Tante Firman'],
    ['628568511113', 'Tari'],
    ['6282299628158', 'Tari Titin'],
    ['6281387892342', 'Tasya'],
    ['6281324931498', 'Warkaya'],
    ['62895402873118', 'Wati'],
    ['6285710695375', 'Yandi Ambiya Rahman Fb Cakpul'],
    ['6285778711614', 'Yani Kjp Cipinang'],
    ['6289501971204', 'Yazra 12 Kka'],
    ['6287887250237', 'Yuni Kedaung Fahri Bening'],
    ['6281289467481', 'Yusna 12 Kka'],
    ['6285883667578', 'Zahra 12 Kka'],
    ['62895332456927', 'Zahra Yatun Fb'],
    ['6289679790877', 'Anisya Marifah Fb Pulogadung'],
    ['6283155861239', 'Dewi Anggraeni Fb Cakpul'],
    ['6285283214905', 'Dita Fb'],
    ['6289676071980', 'Esih Ratna Fb Cakung'],
    ['62895333030897', 'Fita Angesti Fb Cakung'],
    ['6282125632238', 'Ibet Kladeo Fb Cakung'],
    ['6281529831830', 'Ma2 Arjuna Cakung'],
    ['6287727897306', 'Ma2 Baim'],
    ['6288973629190', 'Ma2 Raja Fb Cakung'],
    ['6285817437874', 'Moms Ikky Fb Cakung'],
    ['6287840017196', 'Siti Nurhayati Fb Pulogadung'],
    ['628889518744', 'Sri Ningsih Fb Cakung'],
    ['6285891132740', 'Wulan Dede Fb Pulogadung'],
    ['6285711033918', 'Yuli Ambiya Fb'],
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ambil nama orang tua berdasarkan nomor HP.
 * Membaca dari in-memory Map — selalu up-to-date tanpa restart.
 */
export function getContactName(phone: string): string | null {
    return contactsMap.get(phone) || null;
}

/**
 * Update seluruh isi Map dari data CSV yang sudah di-parse.
 * Dipanggil oleh csvContactsSync.ts saat startup dan saat CSV berubah.
 * Tidak perlu restart bot — langsung aktif.
 */
export function updateContactsMap(newData: Map<string, string>): void {
    contactsMap.clear();
    for (const [phone, name] of newData) {
        contactsMap.set(phone, name);
    }
}

/**
 * Merge data CSV ke Map yang ada (tanpa hapus entri manual yang tidak ada di CSV).
 * Opsional — tidak dipakai saat ini, tapi tersedia jika dibutuhkan.
 */
export function mergeContactsMap(newData: Map<string, string>): void {
    for (const [phone, name] of newData) {
        contactsMap.set(phone, name);
    }
}

/**
 * Return jumlah kontak yang ada di memory (untuk logging).
 */
export function getContactsCount(): number {
    return contactsMap.size;
}
