import 'dotenv/config';

import { supabase } from '../supabase';
import { ADMIN_PHONES_RAW } from '../config/messages';
import { normalizePhone } from '../utils/contactUtils';
import { resolveSenderAccess } from '../services/whitelistGate';

async function pickNonWhitelistedNumber(): Promise<string> {
    const candidates = [
        '628000000000000',
        '628111111111111',
        '628222222222222',
    ];

    for (const candidate of candidates) {
        const { data, error } = await supabase
            .from('whitelisted_phones')
            .select('phone_number')
            .eq('phone_number', candidate)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data?.phone_number) {
            return candidate;
        }
    }

    throw new Error('Tidak menemukan nomor uji yang pasti di luar whitelist.');
}

async function main(): Promise<void> {
    const adminPhone = normalizePhone(ADMIN_PHONES_RAW[0] || '');
    if (!adminPhone) {
        throw new Error('ADMIN_PHONES_RAW kosong, smoke test admin tidak bisa dijalankan.');
    }

    const { data: whitelistSample, error: whitelistError } = await supabase
        .from('whitelisted_phones')
        .select('phone_number, name')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (whitelistError) {
        throw whitelistError;
    }

    if (!whitelistSample?.phone_number) {
        throw new Error('Tabel whitelisted_phones kosong, smoke test whitelist tidak bisa dijalankan.');
    }

    const rejectedPhone = await pickNonWhitelistedNumber();

    const [adminDecision, whitelistDecision, rejectedDecision] = await Promise.all([
        resolveSenderAccess(adminPhone),
        resolveSenderAccess(whitelistSample.phone_number),
        resolveSenderAccess(rejectedPhone),
    ]);

    const report = {
        ok:
            adminDecision.allowed && adminDecision.via === 'admin' &&
            whitelistDecision.allowed && whitelistDecision.via === 'whitelist' &&
            !rejectedDecision.allowed,
        cases: {
            admin: {
                input: adminPhone,
                result: adminDecision,
            },
            whitelist: {
                input: whitelistSample.phone_number,
                result: whitelistDecision,
            },
            rejected: {
                input: rejectedPhone,
                result: rejectedDecision,
            },
        },
    };

    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
        process.exitCode = 1;
    }
}

void main().catch((error) => {
    console.error('Smoke whitelist failed:', error);
    process.exit(1);
});
