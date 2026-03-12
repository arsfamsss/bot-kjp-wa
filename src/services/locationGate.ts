import {
    getBlockedLocationList,
    isLocationBlocked,
    closeLocation,
    openLocation,
    isGlobalLocationQuotaFull,
} from '../supabase';
import { DHARMAJAYA_MAPPING, PASARJAYA_MAPPING } from '../config/messages';
import { getProcessingDayKey } from '../time';

export type ProviderType = 'PASARJAYA' | 'DHARMAJAYA';

function buildLocationKey(provider: ProviderType, subLocation: string): string {
    return `${provider} - ${(subLocation || '').trim()}`;
}

export function getProviderSubLocations(provider: ProviderType): string[] {
    if (provider === 'DHARMAJAYA') {
        return Object.values(DHARMAJAYA_MAPPING);
    }
    return Object.values(PASARJAYA_MAPPING);
}

export async function isSpecificLocationClosed(provider: ProviderType, subLocation: string): Promise<{ closed: boolean; reason?: string | null }> {
    const locationKey = buildLocationKey(provider, subLocation);
    const blockedResult = await isLocationBlocked(locationKey);
    if (blockedResult.blocked) {
        return { closed: true, reason: blockedResult.reason || null };
    }

    if (provider !== 'DHARMAJAYA') {
        return { closed: false, reason: null };
    }

    const dayKey = getProcessingDayKey(new Date());
    const quotaResult = await isGlobalLocationQuotaFull(dayKey, locationKey);
    if (quotaResult.full) {
        return {
            closed: true,
            reason: `Kuota global harian sudah penuh (${quotaResult.used}/${quotaResult.limit}).`,
        };
    }

    return { closed: false, reason: null };
}

export async function closeSpecificLocation(
    provider: ProviderType,
    subLocation: string,
    reason?: string
): Promise<{ success: boolean; message: string }> {
    const locationKey = buildLocationKey(provider, subLocation);
    return closeLocation(locationKey, reason);
}

export async function openSpecificLocation(
    provider: ProviderType,
    subLocation: string
): Promise<{ success: boolean; message: string }> {
    const locationKey = buildLocationKey(provider, subLocation);
    return openLocation(locationKey);
}

export async function listClosedLocationsByProvider(provider: ProviderType): Promise<string[]> {
    const rows = await getBlockedLocationList(500);
    const prefix = `${provider} - `;
    return rows
        .map((row) => row.location_key)
        .filter((key) => key.startsWith(prefix));
}

export async function buildDharmajayaMenuWithStatus(): Promise<string> {
    const closed = new Set(await listClosedLocationsByProvider('DHARMAJAYA'));
    const dayKey = getProcessingDayKey(new Date());

    await Promise.all(
        Object.values(DHARMAJAYA_MAPPING).map(async (name) => {
            const locationKey = buildLocationKey('DHARMAJAYA', name);
            const quotaResult = await isGlobalLocationQuotaFull(dayKey, locationKey);
            if (quotaResult.full) {
                closed.add(locationKey);
            }
        })
    );

    const options = Object.entries(DHARMAJAYA_MAPPING).map(([idx, name]) => {
        const marker = closed.has(buildLocationKey('DHARMAJAYA', name)) ? ' (TUTUP)' : '';
        return `*${idx}.* ${name}${marker}`;
    });

    return [
        '📍 *LOKASI PENGAMBILAN*',
        '',
        ...options,
        '',
        '_Silakan balas dengan angka pilihanmu!_',
        '_(Ketik 0 untuk batal)_',
        '',
        'Catatan: Lokasi bertanda *(TUTUP)* sedang ditutup sementara.',
    ].join('\n');
}
