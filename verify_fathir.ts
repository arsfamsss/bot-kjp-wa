import { supabase } from './src/supabase';

console.log('--- Checking Fathir Min 7 Data ---');

async function check() {
    const { data, error } = await supabase
        .from('registration_results')
        .select('nama, status')
        .ilike('nama', '%Fathir Min 7%')
        .eq('processing_day_key', '2026-02-13');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Total Found: ${data.length}`);
    data.forEach((d: any) => {
        console.log(`- ${d.nama}: ${d.status}`);
    });
}

check();
