import * as fs from 'fs';
import * as path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'card_prefix_map.json');
const DEFAULT_PREFIX_MAP: Record<string, string> = {
    '50494885': 'KJP',
    '50494812': 'KJP',
};

let prefixCache: Record<string, string> | null = null;

function sanitizePrefixMap(input: unknown): Record<string, string> {
    const clean: Record<string, string> = {};
    if (!input || typeof input !== 'object') return { ...DEFAULT_PREFIX_MAP };

    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        const prefix = String(k || '').replace(/\D/g, '');
        const jenis = String(v || '').trim().toUpperCase();
        if (prefix.length === 8 && prefix.startsWith('504948') && jenis) {
            clean[prefix] = jenis;
        }
    }

    if (!clean['50494885']) clean['50494885'] = 'KJP';
    if (!clean['50494812']) clean['50494812'] = 'KJP';

    return clean;
}

function persist(map: Record<string, string>): void {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(map, null, 2), 'utf8');
}

export function getCardPrefixMap(): Record<string, string> {
    if (prefixCache) return { ...prefixCache };

    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            prefixCache = { ...DEFAULT_PREFIX_MAP };
            persist(prefixCache);
            return { ...prefixCache };
        }

        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        prefixCache = sanitizePrefixMap(parsed);
        if (JSON.stringify(parsed) !== JSON.stringify(prefixCache)) {
            persist(prefixCache);
        }
        return { ...prefixCache };
    } catch {
        prefixCache = { ...DEFAULT_PREFIX_MAP };
        return { ...prefixCache };
    }
}

export function getCardPrefixType(prefix8: string): string | null {
    const map = getCardPrefixMap();
    return map[prefix8] || null;
}

export function upsertCardPrefix(prefix8: string, jenis: string): { success: boolean; message: string } {
    const prefix = (prefix8 || '').replace(/\D/g, '');
    const type = (jenis || '').trim().toUpperCase();

    if (prefix.length !== 8 || !prefix.startsWith('504948')) {
        return { success: false, message: 'Prefix harus 8 digit dan diawali 504948.' };
    }
    if (!type) {
        return { success: false, message: 'Jenis kartu tidak boleh kosong.' };
    }

    const map = getCardPrefixMap();
    map[prefix] = type;
    prefixCache = map;
    persist(map);

    return { success: true, message: `Prefix ${prefix} -> ${type} berhasil disimpan.` };
}

export function deleteCardPrefix(prefix8: string): { success: boolean; message: string } {
    const prefix = (prefix8 || '').replace(/\D/g, '');
    if (prefix.length !== 8 || !prefix.startsWith('504948')) {
        return { success: false, message: 'Prefix harus 8 digit dan diawali 504948.' };
    }
    if (prefix === '50494885') {
        return { success: false, message: 'Prefix 50494885 (KJP) tidak boleh dihapus.' };
    }

    const map = getCardPrefixMap();
    if (!map[prefix]) {
        return { success: false, message: `Prefix ${prefix} tidak ditemukan.` };
    }

    delete map[prefix];
    prefixCache = map;
    persist(map);

    return { success: true, message: `Prefix ${prefix} berhasil dihapus.` };
}
