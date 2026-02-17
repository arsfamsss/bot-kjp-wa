
import { getBotSettings, formatCloseTimeString, formatOpenTimeString } from './supabase';

async function main() {
    console.log('Fetching bot settings...');
    try {
        const settings = await getBotSettings();
        console.log('--- Current Bot Settings ---');
        console.log(`Close Start: ${settings.close_hour_start}:${settings.close_minute_start.toString().padStart(2, '0')}`);
        console.log(`Close End:   ${settings.close_hour_end}:${settings.close_minute_end.toString().padStart(2, '0')}`);
        console.log(`Formatted:   ${formatCloseTimeString(settings)}`);
        console.log(`Open At:     ${formatOpenTimeString(settings)} WIB`);
        console.log(`Manual Close Start: ${settings.manual_close_start || 'None'}`);
        console.log(`Manual Close End:   ${settings.manual_close_end || 'None'}`);
        console.log('----------------------------');
    } catch (error) {
        console.error('Error fetching settings:', error);
    }
}

main();
