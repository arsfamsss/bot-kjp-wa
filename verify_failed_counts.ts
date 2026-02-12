import { supabase } from './src/supabase';

console.log('--- Checking Synchronization Status (Success & Failed) ---');

async function verify() {
    try {
        console.log('Fetching data from Supabase...');
        // Fetch ALL data for today (Success + Failed)
        const { data, error } = await supabase
            .from('registration_results')
            .select('*')
            .eq('processing_day_key', '2026-02-13');

        if (error) {
            console.error('Error fetching data:', error);
            return;
        }

        const SUCCESS = data.filter((d: any) => d.status === 'SUCCESS');
        const FAILED = data.filter((d: any) => d.status === 'FAILED');
        const REREGISTERED = data.filter((d: any) => d.status === 'RE_REGISTERED');

        console.log(`\n📊 RINGKASAN DATA DATABASE (2026-02-13):`);
        console.log(`✅ SUKSES       : ${SUCCESS.length}`);
        console.log(`❌ GAGAL        : ${FAILED.length}`);
        console.log(`🔄 RE-REGISTER  : ${REREGISTERED.length}`);
        console.log(`------------------------------`);
        console.log(`TOTAL DATA      : ${data.length}`);

        console.log('\n--- Detail GAGAL per Orang Tua ---');
        const counts: Record<string, number> = {};
        FAILED.forEach((row: any) => {
            const fullName = row.nama || '';
            const parentMatch = fullName.match(/^(.*?)\s*\(/);
            const parent = parentMatch ? parentMatch[1].trim() : fullName;
            counts[parent] = (counts[parent] || 0) + 1;
        });

        Object.keys(counts).sort().forEach((key, index) => {
            console.log(`${index + 1}. ${key} = ${counts[key]} Transaksi`);
        });

        console.log('\n--- Detail SUKSES per Orang Tua (Sample) ---');
        // Just count for success too
        const successCounts: Record<string, number> = {};
        SUCCESS.forEach((row: any) => {
            const fullName = row.nama || '';
            const parentMatch = fullName.match(/^(.*?)\s*\(/);
            const parent = parentMatch ? parentMatch[1].trim() : fullName;
            successCounts[parent] = (successCounts[parent] || 0) + 1;
        });
        Object.keys(successCounts).sort().forEach((key, index) => {
            console.log(`${index + 1}. ${key} = ${successCounts[key]} Transaksi`);
        });


    } catch (err) {
        console.error("Crash inside verify:", err);
    } finally {
        console.log('\n--- END VERIFICATION ---');
    }
}

verify();
