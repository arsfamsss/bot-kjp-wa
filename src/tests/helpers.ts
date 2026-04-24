// Mock Supabase client builder
// Creates a chainable mock that mimics supabase.from('table').select().eq().single() etc.

export function createMockSupabaseClient() {
    const mockChain: any = {
        data: null,
        error: null,
    };
    
    const chainable = new Proxy({} as any, {
        get(target, prop) {
            if (prop === 'then') return undefined; // Not a promise
            if (prop === 'data') return mockChain.data;
            if (prop === 'error') return mockChain.error;
            return (...args: any[]) => chainable;
        }
    });
    
    return {
        from: (table: string) => chainable,
        setMockResponse: (data: any, error: any = null) => {
            mockChain.data = data;
            mockChain.error = error;
        }
    };
}

// Test data factories
export function createBlockedLocation(overrides: Partial<{
    id: number;
    location_key: string;
    provider: string;
    reason: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}> = {}) {
    return {
        id: 1,
        location_key: 'DHARMAJAYA - Cakung',
        provider: 'DHARMAJAYA',
        reason: 'Test reason',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}

export function createSchedule(overrides: Partial<{
    id: string;
    provider: string;
    sub_location: string | null;
    action: string;
    schedule_type: string;
    scheduled_time: string;
    recurring_time: string | null;
    reason: string | null;
    is_active: boolean;
    last_executed_at: string | null;
    created_at: string;
}> = {}) {
    return {
        id: crypto.randomUUID(),
        provider: 'DHARMAJAYA',
        sub_location: null,
        action: 'close',
        schedule_type: 'one_time',
        scheduled_time: new Date().toISOString(),
        recurring_time: null,
        reason: null,
        is_active: true,
        last_executed_at: null,
        created_at: new Date().toISOString(),
        ...overrides,
    };
}
