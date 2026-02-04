
import { cleanName } from '../src/parser';

const testCases = [
    { input: 'Ayu Naira Yumna jRusun Pesakih)', expected: 'Ayu Naira Yumna J' },
    { input: 'Waris chelsea (Kedoya)', expected: 'Waris chelsea' },
    { input: 'Nama: Rijal (kecamatan Cengkareng)', expected: 'Rijal' },
    { input: 'Nama = Zarqa Alin Shofiyah', expected: 'Zarqa Alin Shofiyah' },
    { input: ':MUHAMMAD ALIEF', expected: 'MUHAMMAD ALIEF' },
    { input: 'Nama: Asya Felicia zhafarani', expected: 'Asya Felicia zhafarani' },
    { input: 'nada ( persakih)', expected: 'Nada' },
    { input: 'nama: Naila aryanti(Kedoya)', expected: 'Naila aryanti' },
    { input: 'nama: Muhammad restu fauzi (Kedoya)', expected: 'Muhammad restu fauzi' },
    { input: 'nama: Ayra hasya zara(kedoya)', expected: 'Ayra hasya zara' },
    { input: 'nama:Dafa(Kedoya)', expected: 'Dafa' },
];

console.log('Running Reproduction Tests...');
let passed = 0;
testCases.forEach((test, index) => {
    const result = cleanName(test.input).trim();
    const isMatch = result.toLowerCase() === test.expected.toLowerCase();

    if (isMatch) {
        passed++;
    } else {
        console.log(`\n[FAIL] Test #${index + 1}`);
        console.log(`Input:    "${test.input}"`);
        console.log(`Expected: "${test.expected}"`);
        console.log(`Actual:   "${result}"`);
    }
});

console.log(`\nPassed ${passed}/${testCases.length} tests.`);
