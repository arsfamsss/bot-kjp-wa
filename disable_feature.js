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
function disableFeature() {
    return __awaiter(this, void 0, void 0, function* () {
        const { error } = yield supabase_1.supabase
            .from('bot_settings')
            .update({ fitur_daftar_ulang: false })
            .eq('id', 1);
        if (error) {
            console.error('Error disabling feature:', error);
        }
        else {
            console.log('Successfully disabled fitur_daftar_ulang.');
        }
    });
}
disableFeature();
