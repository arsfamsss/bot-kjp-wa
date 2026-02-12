import { supabase } from './src/supabase';

async function disableFeature() {
    const { error } = await supabase
        .from('bot_settings')
        .update({ fitur_daftar_ulang: false })
        .eq('id', 1);

    if (error) {
        console.error('Error disabling feature:', error);
    } else {
        console.log('Successfully disabled fitur_daftar_ulang.');
    }
}

disableFeature();
