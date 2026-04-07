const { readFileSync } = require('fs');

// We need to look at data/hardware-presets.ts
const code = readFileSync('src/data/hardware-presets.ts', 'utf8');
console.log(code.substring(0, 1000));
