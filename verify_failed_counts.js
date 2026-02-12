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
console.log('--- Checking Synchronization Status (Success & Failed) ---');
function verify() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Fetching data from Supabase...');
            // Fetch ALL data for today (Success + Failed)
            const { data, error } = yield supabase_1.supabase
                .from('registration_results')
                .select('*')
                .eq('processing_day_key', '2026-02-13');
            if (error) {
                console.error('Error fetching data:', error);
                return;
            }
            const SUCCESS = data.filter((d) => d.status === 'SUCCESS');
            const FAILED = data.filter((d) => d.status === 'FAILED');
            const REREGISTERED = data.filter((d) => d.status === 'RE_REGISTERED');
            console.log(`\n📊 RINGKASAN DATA DATABASE (2026-02-13):`);
            console.log(`✅ SUKSES       : ${SUCCESS.length}`);
            console.log(`❌ GAGAL        : ${FAILED.length}`);
            console.log(`🔄 RE-REGISTER  : ${REREGISTERED.length}`);
            console.log(`------------------------------`);
            console.log(`TOTAL DATA      : ${data.length}`);
            console.log('\n--- Detail GAGAL per Orang Tua ---');
            const counts = {};
            FAILED.forEach((row) => {
                const fullName = row.nama || '';
                const parentMatch = fullName.match(/^(.*?)\s*\(/);
                const parent = parentMatch ? parentMatch[1].trim() : fullName;
                counts[parent] = (counts[parent] || 0) + 1;
            });
            Object.keys(counts).sort().forEach((key, index) => {
                console.log(`${index + 1}. ${key} = ${counts[key]} Transaksi`);
            });
            console.log('\n--- Detail SUKSES per Orang Tua (Sample) ---');
            // Just count for success too
            const successCounts = {};
            SUCCESS.forEach((row) => {
                const fullName = row.nama || '';
                const parentMatch = fullName.match(/^(.*?)\s*\(/);
                const parent = parentMatch ? parentMatch[1].trim() : fullName;
                successCounts[parent] = (successCounts[parent] || 0) + 1;
            });
            Object.keys(successCounts).sort().forEach((key, index) => {
                console.log(`${index + 1}. ${key} = ${successCounts[key]} Transaksi`);
            });
        }
        catch (err) {
            console.error("Crash inside verify:", err);
        }
        finally {
            console.log('\n--- END VERIFICATION ---');
        }
    });
}
verify();
