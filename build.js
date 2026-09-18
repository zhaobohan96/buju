const fs = require('fs');
const path = require('path');

const sgfDir = path.join(__dirname, 'data');
const CHUNK_SIZE = 100;

function parseSGFProperty(content, propName) {
    const results = [];
    const propRegex = new RegExp(propName + '\\s*(?=\\[)', 'g');
    let propMatch;
    while ((propMatch = propRegex.exec(content)) !== null) {
        let i = propMatch.index + propName.length;
        while (i < content.length) {
            while (i < content.length && (content[i] === ' ' || content[i] === '\r' || content[i] === '\n' || content[i] === '\t')) i++;
            if (content[i] !== '[') break;
            i++;
            let value = '';
            while (i < content.length && content[i] !== ']') { value += content[i]; i++; }
            if (value) results.push(value);
            i++;
        }
    }
    return results;
}

const files = fs.readdirSync(sgfDir)
    .filter(f => f.endsWith('.sgf') && /^\d+\.sgf$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b));

const allNums = files.map(f => parseInt(f));
const total = allNums.length;

const manifest = { total, chunks: [] };
const numChunks = Math.ceil(total / CHUNK_SIZE);

for (let i = 0; i < numChunks; i++) {
    const chunkNums = allNums.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const chunkData = {};

    for (const num of chunkNums) {
        const content = fs.readFileSync(path.join(sgfDir, `${num}.sgf`), 'utf-8');

        const sizeMatch = content.match(/SZ\[(\d+)\]/);
        const size = sizeMatch ? parseInt(sizeMatch[1]) : 19;

        const allAB = parseSGFProperty(content, 'AB');
        const setupBlack = allAB.length > 1 ? allAB.slice(0, -1) : allAB;
        const extraBlack = allAB.length > 1 ? [allAB[allAB.length - 1]] : [];

        const setupWhite = parseSGFProperty(content, 'AW');

        const trProps = parseSGFProperty(content, 'TR');
        const lastMove = trProps.length > 0 ? trProps[0] : null;

        const allBlack = setupBlack.concat(extraBlack);
        var nextColor = 'B';
        if (lastMove) {
            if (allBlack.includes(lastMove)) nextColor = 'W';
            else if (setupWhite.includes(lastMove)) nextColor = 'B';
        }

        const lbProps = parseSGFProperty(content, 'LB');
        const choices = {};
        for (const lb of lbProps) {
            const colonIdx = lb.indexOf(':');
            if (colonIdx !== -1) {
                const coord = lb.substring(0, colonIdx);
                const label = lb.substring(colonIdx + 1);
                choices[label] = coord;
            }
        }

        chunkData[num] = JSON.stringify({
            size,
            setupBlack,
            setupWhite,
            extraBlack,
            lastMove,
            nextColor,
            choices
        });
    }

    const chunkFile = `chunk-${i}.json`;
    fs.writeFileSync(path.join(sgfDir, chunkFile), JSON.stringify(chunkData));
    manifest.chunks.push({
        file: chunkFile,
        range: [chunkNums[0], chunkNums[chunkNums.length - 1]]
    });
}

fs.writeFileSync(path.join(sgfDir, 'manifest.json'), JSON.stringify(manifest));
console.log(`Generated ${total} problems in ${numChunks} chunks`);

const totalSize = manifest.chunks.reduce((s, c) => s + fs.statSync(path.join(sgfDir, c.file)).size, 0);
console.log(`Total data size: ${(totalSize / 1024).toFixed(1)} KB`);
