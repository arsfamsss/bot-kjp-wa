
import { parseRawMessageToLines, groupLinesToBlocks, validateBlockToItem } from '../src/parser';

const inputText = `Ruby Al Rasyid 5049488507234184
3322045209860001
3173011104220040`;

console.log("--- Input Text ---");
console.log(inputText);
console.log("------------------");

const lines = parseRawMessageToLines(inputText);
console.log(`Parsed Lines (Count: ${lines.length}):`);
lines.forEach((line, i) => console.log(`[${i}] ${line}`));

const { blocks, remainder } = groupLinesToBlocks(lines, 4);
console.log(`\nBlocks Created: ${blocks.length}`);
console.log(`Remainder Lines: ${remainder.length}`);

if (blocks.length > 0) {
    const item = validateBlockToItem(blocks[0], 1, 'DEFAULT');
    console.log("\n--- Item Validation Result ---");
    console.log("Status:", item.status);
    console.log("Parsed Data:", JSON.stringify(item.parsed, null, 2));
    console.log("Errors:", item.errors);
}
