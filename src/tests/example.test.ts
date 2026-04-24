import { describe, it, expect } from 'bun:test';
import { createBlockedLocation, createSchedule } from './helpers';

describe('Test Infrastructure', () => {
    it('should run tests successfully', () => {
        expect(1 + 1).toBe(2);
    });

    it('should create mock blocked location', () => {
        const loc = createBlockedLocation({ provider: 'PASARJAYA' });
        expect(loc.provider).toBe('PASARJAYA');
        expect(loc.is_active).toBe(true);
    });

    it('should create mock schedule', () => {
        const sched = createSchedule({ action: 'open', schedule_type: 'recurring' });
        expect(sched.action).toBe('open');
        expect(sched.schedule_type).toBe('recurring');
        expect(sched.is_active).toBe(true);
    });
});
