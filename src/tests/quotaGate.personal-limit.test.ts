import assert from 'node:assert/strict';
import { createQuotaGateChecker } from '../services/quotaGate';

type CounterKey = string;

function makeCounterKey(scopeType: 'GLOBAL' | 'PERSONAL', scopeKey: string, dayKey: string): CounterKey {
    return `${scopeType}:${scopeKey}:${dayKey}`;
}

async function run() {
    const counters = new Map<CounterKey, number>();
    const targetPhone = '6281808124933';
    const senderInput = '081808124933';

    const checkQuota = createQuotaGateChecker({
        getBotSettings: async () => ({
            close_hour_start: 0,
            close_minute_start: 0,
            close_hour_end: 6,
            close_minute_end: 0,
            close_message_template: 'closed',
            manual_close_start: null,
            manual_close_end: null,
            duplicate_mode: 'MIXED',
            duplicate_session_minutes: 0,
            duplicate_global_days: 0,
            duplicate_strict_anywhere: true,
            quota_enabled: true,
            quota_mode: 'PERSONAL',
            quota_daily_limit: 35,
        }),
        findDailyQuotaTargetPhoneForSender: async (senderPhone: string) => {
            return senderPhone === senderInput ? targetPhone : null;
        },
        reserveDailyQuotaAtomic: async input => {
            const key = makeCounterKey(input.scopeType, input.scopeKey, input.processingDayKey);
            const used = counters.get(key) ?? 0;
            const next = used + input.incrementCount;
            if (next > input.quotaLimit) {
                return {
                    success: true,
                    allowed: false,
                    used_after: used,
                    quota_limit: input.quotaLimit,
                    reason: 'quota_full',
                };
            }
            counters.set(key, next);
            return {
                success: true,
                allowed: true,
                used_after: next,
                quota_limit: input.quotaLimit,
                reason: 'quota_reserved',
            };
        },
    });

    const first = await checkQuota({
        senderPhone: senderInput,
        processingDayKey: '2026-03-03',
        incrementCount: 35,
    });
    assert.equal(first.allowed, true, 'first batch 35 harus lolos');
    assert.equal(first.mode, 'PERSONAL');
    assert.equal(first.scope_key, targetPhone);

    const second = await checkQuota({
        senderPhone: senderInput,
        processingDayKey: '2026-03-03',
        incrementCount: 1,
    });
    assert.equal(second.allowed, false, 'item ke-36 harus ditolak');
    assert.equal(second.reason, 'quota_full');

    const nonTarget = await checkQuota({
        senderPhone: '081234567890',
        processingDayKey: '2026-03-03',
        incrementCount: 5,
    });
    assert.equal(nonTarget.allowed, false, 'nomor non-target harus ditolak pada mode PERSONAL');
    assert.equal(nonTarget.reason, 'sender_not_in_personal_target');

    console.log('PASS quotaGate.personal-limit.test');
}

run().catch(error => {
    console.error('FAIL quotaGate.personal-limit.test');
    console.error(error);
    process.exit(1);
});
