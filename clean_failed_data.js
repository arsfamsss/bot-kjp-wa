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
function clean() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Memulai penghapusan data FAILED & RE_REGISTERED tanggal 2026-02-13...");
        // Hapus semua FAILED, tanpa pandang bulu (agar bersih total)
        // Termasuk yang offered_reregister=true atau false
        const { data, error, count } = yield supabase_1.supabase
            .from('registration_results')
            .delete({ count: 'exact' })
            .in('status', ['FAILED', 'RE_REGISTERED'])
            .eq('processing_day_key', '2026-02-13');
        if (error) {
            console.error('❌ Error saat menghapus:', error);
        }
        else {
            // Note: count might be null if count option not supported by client fully, but usually works
            console.log(`✅ BERHASIL MENGHAPUS DATA GAGAL & RE-REGISTER.`);
            if (count !== null)
                console.log(`Total dihapus: ${count} baris.`);
            console.log('Sekarang database bersih total (termasuk auto-match hilang).');
            console.log('Silakan jalankan ulang bot CEK STATUS.');
        }
    });
}
clean();
