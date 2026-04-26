import {
    getBlockedLocationList,
    isLocationBlocked,
    isProviderBlocked,
    closeLocation,
    openLocation,
    isGlobalLocationQuotaFull,
    getProviderOverride,
} from '../supabase';
import { DHARMAJAYA_MAPPING, PASARJAYA_MAPPING, isProviderOpen, REGISTRATION_HOURS } from '../config/messages';
import { getProcessingDayKey } from '../time';

export type ProviderType = 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION';

function buildLocationKey(provider: ProviderType, subLocation: string): string {
    return `${provider} - ${(subLocation || '').trim()}`;
}

export function getProviderSubLocations(provider: ProviderType): string[] {
    if (provider === 'DHARMAJAYA') {
        return Object.values(DHARMAJAYA_MAPPING);
    }
    if (provider === 'FOOD_STATION') {
        return ['FOOD STATION'];
    }
    return Object.values(PASARJAYA_MAPPING);
}

export async function isSpecificLocationClosed(provider: ProviderType, subLocation: string): Promise<{ closed: boolean; reason?: string | null }> {
    const locationKey = buildLocationKey(provider, subLocation);

    // Phase 0: Check operating hours + override
    const override = await getProviderOverride(provider);

    if (override) {
        if (override.override_type === 'open') {
            // Check if open override is expired
            if (override.expires_at) {
                const expiresAt = new Date(override.expires_at);
                if (new Date() > expiresAt) {
                    // Expired — fall through to default hours check
                } else {
                    return { closed: false, reason: null }; // Override: buka
                }
            } else {
                return { closed: false, reason: null }; // Override tanpa expiry: buka
            }
        } else if (override.override_type === 'close') {
            // Check if close override is in range
            if (override.manual_close_start && override.manual_close_end) {
                const now = new Date();
                const start = new Date(override.manual_close_start);
                const end = new Date(override.manual_close_end);
                if (now >= start && now <= end) {
                    return { closed: true, reason: 'Ditutup sementara oleh admin' };
                }
                // Outside range — fall through to default hours check
            }
        }
    }

    // Check default operating hours
    if (!isProviderOpen(provider)) {
        const config = REGISTRATION_HOURS[provider];
        const label = config ? config.label : '';
        return { closed: true, reason: `Di luar jam operasional (${label} WIB)` };
    }

    // 1. Check specific sub-location key
    const subBlocked = await isLocationBlocked(locationKey);
    if (subBlocked.blocked) {
        return { closed: true, reason: subBlocked.reason || null };
    }

    // 2. Check provider-level key
    const providerBlocked = await isProviderBlocked(provider);
    if (providerBlocked) {
        return { closed: true, reason: 'Provider ditutup' };
    }

    // 3. Check quota (Dharmajaya only)
    if (provider === 'DHARMAJAYA') {
        const dayKey = getProcessingDayKey(new Date());
        const quotaResult = await isGlobalLocationQuotaFull(dayKey, locationKey);
        if (quotaResult.full) {
            return {
                closed: true,
                reason: `Kuota global harian sudah penuh (${quotaResult.used}/${quotaResult.limit}).`,
            };
        }
    }

    return { closed: false, reason: null };
}

export async function closeSpecificLocation(
    provider: ProviderType,
    subLocation: string,
    reason?: string
): Promise<{ success: boolean; message: string }> {
    const locationKey = buildLocationKey(provider, subLocation);
    return closeLocation(provider, locationKey, reason);
}

export async function openSpecificLocation(
    provider: ProviderType,
    subLocation: string
): Promise<{ success: boolean; message: string }> {
    const locationKey = buildLocationKey(provider, subLocation);
    return openLocation(provider, locationKey);
}

export async function listClosedLocationsByProvider(provider: ProviderType): Promise<string[]> {
    const rows = await getBlockedLocationList(500);
    const prefix = `${provider} - `;
    return rows
        .map((row) => row.location_key)
        .filter((key) => key.startsWith(prefix));
}

export async function buildProviderMenuWithStatus(provider: string, mapping: Record<string, string>): Promise<string> {
    const providerKey = provider as ProviderType;
    const closed = new Set(await listClosedLocationsByProvider(providerKey));
    const dayKey = getProcessingDayKey(new Date());

    await Promise.all(
        Object.values(mapping).map(async (name) => {
            const locationKey = buildLocationKey(providerKey, name);
            const quotaResult = await isGlobalLocationQuotaFull(dayKey, locationKey);
            if (quotaResult.full) {
                closed.add(locationKey);
            }
        })
    );

    const options = Object.entries(mapping).map(([idx, name]) => {
        const marker = closed.has(buildLocationKey(providerKey, name)) ? ' (TUTUP)' : '';
        return `*${idx}.* ${name}${marker}`;
    });

    return [
        '\u{1F4CD} *LOKASI PENGAMBILAN*',
        '',
        ...options,
        '',
        '_Silakan balas dengan angka pilihanmu!_',
        '_(Ketik 0 untuk batal)_',
        '',
        'Catatan: Lokasi bertanda *(TUTUP)* sedang ditutup sementara.',
    ].join('\n');
}

/** @deprecated Use buildProviderMenuWithStatus('DHARMAJAYA', DHARMAJAYA_MAPPING) instead */
export async function buildDharmajayaMenuWithStatus(): Promise<string> {
    return buildProviderMenuWithStatus('DHARMAJAYA', DHARMAJAYA_MAPPING);
}

export async function listAllProviderStatuses(): Promise<Array<{ provider: string; name: string; closed: boolean }>> {
    const providers: Array<{ key: ProviderType; name: string }> = [
        { key: 'DHARMAJAYA', name: 'Dharmajaya' },
        { key: 'PASARJAYA', name: 'Pasarjaya' },
        { key: 'FOOD_STATION', name: 'Foodstation' },
    ];

    const results = await Promise.all(
        providers.map(async ({ key, name }) => {
            const closed = await isProviderBlocked(key);
            return { provider: key, name, closed };
        })
    );

    return results;
}
