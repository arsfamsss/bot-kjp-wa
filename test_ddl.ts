import { supabase } from './src/supabase';

async function run() {
    const { data, error } = await supabase.rpc('exec_sql', {
        query: 'SELECT 1;'
    });
    console.log("Error:", error);
    process.exit(0);
}
run();
