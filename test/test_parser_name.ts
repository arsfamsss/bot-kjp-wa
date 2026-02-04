
import { parseBlockToItem } from '../src/parser';

// Mock cleanName by exporting it or copying logic for test if it's not exported
// Since cleanName is not exported, we test it via parseBlockToItem which uses it.

const testCases = [
    {
        input: "Cayla (bude)",
        expected: "Cayla Bude"
    },
    {
        input: "Rijal kecamatan cengkareng",
        expected: "Rijal"
    },
    {
        input: "M. Rizky",
        expected: "M Rizky"
    },
    {
        input: "Siti A'isyah",
        expected: "Siti A Isyah"
    },
    {
        input: "Jean-Pierre",
        expected: "Jean Pierre"
    },
    {
        input: "budi agus pangestu",
        expected: "Budi Agus Pangestu"
    },
    {
        input: "Nama : Bambang (duri kosambi)",
        expected: "Bambang"
    },
    {
        input: "Ibu Nurul (Rusun Pesakih)",
        expected: "Ibu Nurul"
    }
];

console.log("Starting Test...");

let passed = 0;
testCases.forEach((tc, idx) => {
    // block = [Name, KJP, KTP, KK]
    const block = [tc.input, "5049488500001234", "3171234567890123", "3171098765432109"];
    const result = parseBlockToItem(block, idx, "2023-10-27");
    const actual = result.parsed.nama;

    if (actual === tc.expected) {
        console.log(`[PASS] "${tc.input}" -> "${actual}"`);
        passed++;
    } else {
        console.log(`[FAIL] "${tc.input}"`);
        console.log(`       Expected: "${tc.expected}"`);
        console.log(`       Actual:   "${actual}"`);
    }
});

console.log(`\nResult: ${passed}/${testCases.length} passed.`);
