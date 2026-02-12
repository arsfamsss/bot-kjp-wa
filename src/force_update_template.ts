import { updateBotSettings } from './supabase';
import { CLOSE_MESSAGE_TEMPLATE_UNIFIED } from './config/messages';

async function main() {
    console.log('Using template:', CLOSE_MESSAGE_TEMPLATE_UNIFIED);
    try {
        const result = await updateBotSettings({
            close_message_template: CLOSE_MESSAGE_TEMPLATE_UNIFIED
        });
        if (result) {
            console.log('✅ Successfully updated bot settings!');
        } else {
            console.error('❌ Failed to update bot settings.');
        }
    } catch (error) {
        console.error('❌ Error executing update:', error);
    }
}

main().catch(console.error);
