import * as fs from 'fs';
import * as path from 'path';

import { DHARMAJAYA_MAPPING } from '../config/messages';

const QUOTA_FILE_PATH = path.resolve(process.cwd(), 'location_quota_limits.json');

type QuotaFileShape = {
    by_location: Record<string, number>;
};

const dharmLocationByChoice = new Map<string, string>(
    Object.entries(DHARMAJAYA_MAPPING).map(([choice, name]) => [choice.trim(), `DHARMAJAYA - ${name}`])
);

function normalizeLocationKey(locationKey: string): string {
    return locationKey.trim().replace(/\s+/g, ' ');
}

function ensureQuotaFile(): void {
    if (!fs.existsSync(QUOTA_FILE_PATH)) {
        const initial: QuotaFileShape = { by_location: {} };
        fs.writeFileSync(QUOTA_FILE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    }
}

function readQuotaFile(): QuotaFileShape {
    ensureQuotaFile();
    try {
        const raw = fs.readFileSync(QUOTA_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<QuotaFileShape>;
        return {
            by_location: parsed.by_location && typeof parsed.by_location === 'object' ? parsed.by_location : {},
        };
    } catch {
        const fallback: QuotaFileShape = { by_location: {} };
        fs.writeFileSync(QUOTA_FILE_PATH, JSON.stringify(fallback, null, 2), 'utf-8');
        return fallback;
    }
}

function writeQuotaFile(data: QuotaFileShape): void {
    fs.writeFileSync(QUOTA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function resolveDharmajayaLocationByChoice(choice: string): string | null {
    const mapped = dharmLocationByChoice.get(choice.trim());
    return mapped ?? null;
}

export function listAllDharmajayaLocations(): string[] {
    return Object.values(DHARMAJAYA_MAPPING).map((name) => `DHARMAJAYA - ${name}`);
}

export function listLocationQuotaLimits(): Array<{ locationKey: string; limit: number | null; enabled: boolean }> {
    const config = readQuotaFile();
    return listAllDharmajayaLocations().map((locationKey) => {
        const normalized = normalizeLocationKey(locationKey);
        const rawLimit = config.by_location[normalized];
        const limit = Number.isInteger(rawLimit) && rawLimit >= 0 ? rawLimit : null;
        return {
            locationKey: normalized,
            limit,
            enabled: limit !== null,
        };
    });
}

export function getLocationQuotaLimit(locationKey: string): number | null {
    const normalized = normalizeLocationKey(locationKey);
    const config = readQuotaFile();
    const rawLimit = config.by_location[normalized];
    if (!Number.isInteger(rawLimit) || rawLimit < 0) return null;
    return rawLimit;
}

export function setLocationQuotaLimit(locationKey: string, limit: number): { success: boolean; message: string } {
    if (!Number.isInteger(limit) || limit < 0) {
        return { success: false, message: '❌ Batas harus berupa angka bulat minimal 0.' };
    }
    const normalized = normalizeLocationKey(locationKey);
    const config = readQuotaFile();
    config.by_location[normalized] = limit;
    writeQuotaFile(config);
    return { success: true, message: `✅ Batas harian untuk *${normalized}* diset ke *${limit}* data/user/hari.` };
}

export function disableLocationQuotaLimit(locationKey: string): { success: boolean; message: string } {
    const normalized = normalizeLocationKey(locationKey);
    const config = readQuotaFile();
    delete config.by_location[normalized];
    writeQuotaFile(config);
    return { success: true, message: `✅ Batas harian untuk *${normalized}* dinonaktifkan.` };
}
