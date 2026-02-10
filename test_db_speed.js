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
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(url, key);
function testSpeed() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Testing Supabase Connection Speed...');
        // Test 1: Simple Select (Ping)
        const start = Date.now();
        const { data, error } = yield supabase.from('data_harian').select('count', { count: 'exact', head: true }).limit(1);
        const duration = Date.now() - start;
        if (error) {
            console.error('❌ Error testing DB:', error.message);
        }
        else {
            console.log(`✅ Result: OK`);
            console.log(`⏱️ Latency: ${duration} ms`);
            if (duration > 1000) {
                console.log('⚠️ WARNING: Database is responding SLOWLY (>1000ms). This explains the bot lag.');
            }
            else {
                console.log('✅ Database speed looks normal.');
            }
        }
        // Test 2: User Lookup (Simulate Chat)
        const start2 = Date.now();
        const { data: user } = yield supabase.from('lid_phone_map').select('*').limit(1);
        const duration2 = Date.now() - start2;
        console.log(`⏱️ Table Lookup Latency: ${duration2} ms`);
    });
}
testSpeed();
