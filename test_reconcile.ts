import { supabase } from './src/supabase';

async function run() {
    const dayKey = process.argv[2];
    if (!dayKey) {
        process.exit(1);
    }
    
    const { error } = await supabase.rpc('reconcile_global_location_quota_day', {
        p_proc_day: dayKey,
        p_location_prefix: 'DHARMAJAYA - ',
    });

    if (error) {
        console.error("RPC Error:", error);
    } else {
        console.log("RPC Success! Reconciled.");
    }
    process.exit(0);
}
run();
