"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const contacts_data_1 = require("./src/contacts_data");
const csvPath = 'd:/BOT/BOT INPUT DATA KJP DI WA OTOMATIS/data_no_kjp.csv';
function normalizePhone(p) {
    let phone = p.replace(/\D/g, '');
    if (phone.startsWith('0'))
        phone = '62' + phone.slice(1);
    return phone;
}
const fileContent = fs.readFileSync(csvPath, 'utf-8');
const lines = fileContent.split('\n').filter(l => l.trim());
// Skip header
const dataLines = lines.slice(1);
const csvContacts = new Map();
dataLines.forEach(line => {
    // Basic CSV parsing
    const parts = line.split(',');
    if (parts.length >= 2) {
        const rawName = parts[0].trim();
        const rawPhone = parts[1].trim();
        if (rawPhone && rawName) {
            const phone = normalizePhone(rawPhone);
            // Extract sender name from "Sender (Student)" format
            let senderName = rawName;
            if (senderName.includes('(')) {
                senderName = senderName.split('(')[0].trim();
            }
            if (csvContacts.has(phone)) {
                const existingName = csvContacts.get(phone);
                if (existingName !== senderName) {
                    console.warn(`WARNING: Duplicate Phone ${phone} has different names: "${existingName}" vs "${senderName}"`);
                }
            }
            else {
                csvContacts.set(phone, senderName);
            }
        }
    }
});
const knownPhones = new Set(Object.keys(contacts_data_1.KNOWN_CONTACTS));
const missingInTs = [];
const diffName = [];
csvContacts.forEach((name, phone) => {
    if (!knownPhones.has(phone)) {
        missingInTs.push(`${phone}: ${name}`);
    }
    else {
        const tsName = contacts_data_1.KNOWN_CONTACTS[phone];
        if (tsName !== name) {
            // Check if it's just a case or minor difference?
            // For now, strict check
            diffName.push(`${phone}: TS="${tsName}" vs CSV="${name}"`);
        }
    }
});
console.log(`Total Unique Phones in CSV: ${csvContacts.size}`);
console.log(`Total Known Contacts in TS: ${knownPhones.size}`);
console.log(`Missing in TS: ${missingInTs.length}`);
console.log(`Name Mismatch: ${diffName.length}`);
if (missingInTs.length > 0) {
    console.log('\nSample Missing (First 10):');
    console.log(missingInTs.join('\n'));
}
if (diffName.length > 0) {
    console.log('\nSample Mismatch (First 10):');
    console.log(diffName.slice(0, 10).join('\n'));
}
