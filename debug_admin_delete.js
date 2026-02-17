"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("./src/supabase");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const phone = '6281906667631';
        const key = '2026-02-16';
        console.log(`Debug Script: Checking data for ${phone} on ${key} (EXACT QUERY)`);
        // 2. Check EXACT QUERY used in bot
        const { data: exact, error: errExact } = yield supabase_1.supabase
            .from('data_harian')
            .select('id, nama, no_kjp, no_ktp, no_kk, lokasi, specific_location')
            .eq('processing_day_key', key)
            .eq('sender_phone', phone)
            .order('nama', { ascending: true })
            .order('id', { ascending: true });
        console.log('--- EXACT BOT QUERY ---');
        if (errExact) {
            console.log('ERROR:', errExact);
        }
        else {
            console.log('Count:', exact === null || exact === void 0 ? void 0 : exact.length);
            if (exact && exact.length > 0) {
                console.log('First Item:', exact[0]);
            }
            else {
                console.log('No data found.');
            }
        }
    });
}
main().catch(console.error);
