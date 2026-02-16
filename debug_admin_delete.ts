
import { supabase } from './src/supabase';

async function main() {
    const phone = '6281906667631';
    const key = '2026-02-16';

    console.log(`Debug Script: Checking data for ${phone} on ${key} (EXACT QUERY)`);

    // 2. Check EXACT QUERY used in bot
    const { data: exact, error: errExact } = await supabase
        .from('data_harian')
        .select('id, nama, no_kjp, no_ktp, no_kk, lokasi, specific_location')
        .eq('processing_day_key', key)
        .eq('sender_phone', phone)
        .order('nama', { ascending: true })
        .order('id', { ascending: true });

    console.log('--- EXACT BOT QUERY ---');
    if (errExact) {
        console.log('ERROR:', errExact);
    } else {
        console.log('Count:', exact?.length);
        if (exact && exact.length > 0) {
            console.log('First Item:', exact[0]);
        } else {
            console.log('No data found.');
        }
    }
}

main().catch(console.error);
