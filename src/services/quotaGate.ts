import {
    findDailyQuotaTargetPhoneForSender,
    getBotSettings,
    reserveDailyQuotaAtomic,
} from '../supabase';

export interface QuotaGateInput {
    senderPhone: string;
    processingDayKey: string;
    incrementCount: number;
}

export interface QuotaGateResult {
    allowed: boolean;
    mode: 'GLOBAL' | 'PERSONAL' | 'DISABLED';
    scope_type: 'GLOBAL' | 'PERSONAL' | '';
    scope_key: string;
    reason: string;
}

export async function checkAndReserveDailyQuota(input: QuotaGateInput): Promise<QuotaGateResult> {
    const incrementCount = Math.max(0, Math.floor(input.incrementCount));
    if (incrementCount <= 0) {
        return { allowed: true, mode: 'DISABLED', scope_type: '', scope_key: '', reason: 'increment_zero' };
    }

    const settings = await getBotSettings();
    const quotaEnabled = settings.quota_enabled === true;
    if (!quotaEnabled) {
        return { allowed: true, mode: 'DISABLED', scope_type: '', scope_key: '', reason: 'quota_disabled' };
    }

    const quotaMode = settings.quota_mode === 'PERSONAL' ? 'PERSONAL' : 'GLOBAL';
    const quotaLimit = typeof settings.quota_daily_limit === 'number' ? settings.quota_daily_limit : 30;

    if (quotaMode === 'GLOBAL') {
        const reservation = await reserveDailyQuotaAtomic({
            scopeType: 'GLOBAL',
            scopeKey: 'GLOBAL',
            processingDayKey: input.processingDayKey,
            incrementCount,
            quotaLimit,
        });

        return {
            allowed: reservation.allowed,
            mode: 'GLOBAL',
            scope_type: 'GLOBAL',
            scope_key: 'GLOBAL',
            reason: reservation.reason,
        };
    }

    const matchedPhone = await findDailyQuotaTargetPhoneForSender(input.senderPhone);
    if (!matchedPhone) {
        return {
            allowed: false,
            mode: 'PERSONAL',
            scope_type: 'PERSONAL',
            scope_key: '',
            reason: 'sender_not_in_personal_target',
        };
    }

    const reservation = await reserveDailyQuotaAtomic({
        scopeType: 'PERSONAL',
        scopeKey: matchedPhone,
        processingDayKey: input.processingDayKey,
        incrementCount,
        quotaLimit,
    });

    if (!reservation.success) {
        return {
            allowed: false,
            mode: 'PERSONAL',
            scope_type: 'PERSONAL',
            scope_key: matchedPhone,
            reason: reservation.reason,
        };
    }

    return {
        allowed: reservation.allowed,
        mode: 'PERSONAL',
        scope_type: 'PERSONAL',
        scope_key: matchedPhone,
        reason: reservation.reason,
    };
}
