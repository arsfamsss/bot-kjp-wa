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
console.log('--- Checking Fathir Min 7 Data ---');
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        const { data, error } = yield supabase_1.supabase
            .from('registration_results')
            .select('nama, status')
            .ilike('nama', '%Fathir Min 7%')
            .eq('processing_day_key', '2026-02-13');
        if (error) {
            console.error('Error:', error);
            return;
        }
        console.log(`Total Found: ${data.length}`);
        data.forEach((d) => {
            console.log(`- ${d.nama}: ${d.status}`);
        });
    });
}
check();
