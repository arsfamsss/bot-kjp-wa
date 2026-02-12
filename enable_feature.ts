import { supabase } from './src/supabase';

async function enableFeature() {
    const { error } = await supabase
        .from('bot_settings')
        .update({ fitur_daftar_ulang: true })
        .eq('id', 1);

    if (error) {
        console.error('Error enabling feature:', error);
    } else {
        console.log('Successfully ENABLED fitur_daftar_ulang. ✅');
    }
}

enableFeature();
