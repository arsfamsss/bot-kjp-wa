import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

const supabase = createClient(url, key);

async function testSpeed() {
    console.log('🚀 Testing Supabase Connection Speed...');

    // Test 1: Simple Select (Ping)
    const start = Date.now();
    const { data, error } = await supabase.from('data_harian').select('count', { count: 'exact', head: true }).limit(1);
    const duration = Date.now() - start;

    if (error) {
        console.error('❌ Error testing DB:', error.message);
    } else {
        console.log(`✅ Result: OK`);
        console.log(`⏱️ Latency: ${duration} ms`);

        if (duration > 1000) {
            console.log('⚠️ WARNING: Database is responding SLOWLY (>1000ms). This explains the bot lag.');
        } else {
            console.log('✅ Database speed looks normal.');
        }
    }

    // Test 2: User Lookup (Simulate Chat)
    const start2 = Date.now();
    const { data: user } = await supabase.from('lid_phone_map').select('*').limit(1);
    const duration2 = Date.now() - start2;
    console.log(`⏱️ Table Lookup Latency: ${duration2} ms`);
}

testSpeed();
