import { supabase } from './src/supabase';

async function clean() {
    console.log("Memulai penghapusan data FAILED & RE_REGISTERED tanggal 2026-02-13...");

    // Hapus semua FAILED, tanpa pandang bulu (agar bersih total)
    // Termasuk yang offered_reregister=true atau false
    const { data, error, count } = await supabase
        .from('registration_results')
        .delete({ count: 'exact' })
        .in('status', ['FAILED', 'RE_REGISTERED'])
        .eq('processing_day_key', '2026-02-13');

    if (error) {
        console.error('❌ Error saat menghapus:', error);
    } else {
        // Note: count might be null if count option not supported by client fully, but usually works
        console.log(`✅ BERHASIL MENGHAPUS DATA GAGAL & RE-REGISTER.`);
        if (count !== null) console.log(`Total dihapus: ${count} baris.`);
        console.log('Sekarang database bersih total (termasuk auto-match hilang).');
        console.log('Silakan jalankan ulang bot CEK STATUS.');
    }
}

clean();
