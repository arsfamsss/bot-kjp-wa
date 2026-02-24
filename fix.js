const fs = require('fs');
let content = fs.readFileSync('src/parser.ts', 'utf8');
content = content.replace(/const isLabel = \/[^\/]+\/i\.test\(candidateName\);/g, "const isLabel = /\b(NIK|KTP|KK|KJP|KAJ|KPDJ|KJMU|LANSIA|PJLP|RUSUN|DISABILITAS|DASAWISMA|DAWIS|GURU|HONORER|PEKERJA|KARTU|KELUARGA|ATM|NO|NOMOR|NOMER)\b/i.test(candidateName);");
fs.writeFileSync('src/parser.ts', content);
