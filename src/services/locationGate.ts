import {
    getBlockedLocationList,
    isLocationBlocked,
    closeLocation,
    openLocation,
} from '../supabase';
import { DHARMAJAYA_MAPPING, PASARJAYA_MAPPING } from '../config/messages';

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
    const result = await isLocationBlocked(locationKey);
    return { closed: result.blocked, reason: result.reason || null };
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
    const options = Object.entries(DHARMAJAYA_MAPPING).map(([idx, name]) => {
        const marker = closed.has(buildLocationKey('DHARMAJAYA', name)) ? ' (FULL)' : '';
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
        'Catatan: Lokasi bertanda *(FULL)* sedang ditutup sementara.',
    ].join('\n');
}
