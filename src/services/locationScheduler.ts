// src/services/locationScheduler.ts
// DB-persisted polling service: checks for due location schedules and executes them.
// Pattern: single setInterval polling loop (no external cron libraries).

import { getActiveSchedules, markScheduleExecuted, closeLocationByProvider, openLocationByProvider } from '../supabase';
import { closeSpecificLocation, openSpecificLocation, ProviderType } from './locationGate';
import { getWibParts, getWibIsoDate } from '../time';

let pollInterval: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecurringDue(schedule: Record<string, unknown>, now: Date): boolean {
    const wibParts = getWibParts(now);
    const currentWibTime = `${String(wibParts.hour).padStart(2, '0')}:${String(wibParts.minute).padStart(2, '0')}`;
    const recurringTime = schedule.recurring_time as string; // "HH:mm" format

    if (currentWibTime < recurringTime) return false;

    // Check if already executed today
    if (schedule.last_executed_at) {
        const lastExecDate = getWibIsoDate(new Date(schedule.last_executed_at as string));
        const todayDate = getWibIsoDate(now);
        if (lastExecDate >= todayDate) return false;
    }

    return true;
}

async function executeScheduleAction(schedule: Record<string, unknown>): Promise<void> {
    const provider = schedule.provider as ProviderType;
    const subLocation = schedule.sub_location as string | null;
    const action = schedule.action as string; // 'open' or 'close'

    if (subLocation) {
        // Sub-location level
        if (action === 'close') {
            await closeSpecificLocation(provider, subLocation, (schedule.reason as string) || 'Ditutup otomatis oleh jadwal');
        } else {
            await openSpecificLocation(provider, subLocation);
        }
    } else {
        // Provider level
        if (action === 'close') {
            await closeLocationByProvider(provider, (schedule.reason as string) || 'Ditutup otomatis oleh jadwal');
        } else {
            await openLocationByProvider(provider);
        }
    }

    console.log(`[SchedulePoller] Executed: ${action} ${provider}${subLocation ? ' - ' + subLocation : ''}`);
}

// ─── Core Loop ────────────────────────────────────────────────────────────────

async function checkAndExecuteSchedules(): Promise<void> {
    try {
        const schedules = await getActiveSchedules();
        if (schedules.length === 0) return;

        const now = new Date();

        for (const schedule of schedules) {
            try {
                const scheduleType = schedule.schedule_type as string;

                if (scheduleType === 'one_time') {
                    const scheduledTime = new Date(schedule.scheduled_time as string);
                    if (scheduledTime <= now) {
                        await executeScheduleAction(schedule);
                        await markScheduleExecuted(schedule.id as string, true);
                    }
                } else if (scheduleType === 'recurring') {
                    if (isRecurringDue(schedule, now)) {
                        await executeScheduleAction(schedule);
                        await markScheduleExecuted(schedule.id as string, false);
                    }
                }
            } catch (err) {
                console.error(`[SchedulePoller] Error executing schedule ${schedule.id}:`, err);
            }
        }
    } catch (err) {
        console.error('[SchedulePoller] Error in polling cycle:', err);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startSchedulePoller(intervalMs: number = 60_000): void {
    if (pollInterval) {
        console.log('[SchedulePoller] Already running');
        return;
    }
    console.log(`[SchedulePoller] Starting with ${intervalMs}ms interval`);
    // Run immediately on start, then on interval
    checkAndExecuteSchedules();
    pollInterval = setInterval(checkAndExecuteSchedules, intervalMs);
}

export function stopSchedulePoller(): void {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
        console.log('[SchedulePoller] Stopped');
    }
}
