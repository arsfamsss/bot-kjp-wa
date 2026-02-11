
import * as fs from 'fs';
import * as path from 'path';
import { KNOWN_CONTACTS } from './src/contacts_data';

const csvPath = 'd:/BOT/BOT INPUT DATA KJP DI WA OTOMATIS/data_no_kjp.csv';

function normalizePhone(p: string) {
    let phone = p.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.slice(1);
    return phone;
}

const fileContent = fs.readFileSync(csvPath, 'utf-8');
const lines = fileContent.split('\n').filter(l => l.trim());

// Skip header
const dataLines = lines.slice(1);

const csvContacts = new Map<string, string>();

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
            } else {
                csvContacts.set(phone, senderName);
            }
        }
    }
});

const knownPhones = new Set(Object.keys(KNOWN_CONTACTS));
const missingInTs: string[] = [];
const diffName: string[] = [];

csvContacts.forEach((name, phone) => {
    if (!knownPhones.has(phone)) {
        missingInTs.push(`${phone}: ${name}`);
    } else {
        const tsName = KNOWN_CONTACTS[phone];
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
