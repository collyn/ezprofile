const { GPU_BY_PLATFORM } = require('./src/data/hardware-presets');

// We need to simulate the component code exactly
const currentPlatform = '';
const rawGpuOptions = currentPlatform && GPU_BY_PLATFORM[currentPlatform]
  ? GPU_BY_PLATFORM[currentPlatform]
  : [...(GPU_BY_PLATFORM.windows || []), ...(GPU_BY_PLATFORM.macos || []), ...(GPU_BY_PLATFORM.linux || [])];
  
const acc = {};
rawGpuOptions.forEach(curr => {
  if (!acc[curr.vendor]) acc[curr.vendor] = { vendor: curr.vendor, renderers: [] };
  acc[curr.vendor].renderers.push(...curr.renderers);
});
const gpuOptions = Object.values(acc);

console.log("length of gpuOptions:", gpuOptions.length);
gpuOptions.forEach(g => {
  console.log(`- vendor: "${g.vendor}", renderers count: ${g.renderers.length}`);
});

const gpuOptionsReact = Object.values(rawGpuOptions.reduce((acc, curr) => {
  if (!acc[curr.vendor]) acc[curr.vendor] = { vendor: curr.vendor, renderers: [] };
  acc[curr.vendor].renderers.push(...curr.renderers);
  return acc;
}, {}));

console.log("\nWith reduce:");
console.log("length:", gpuOptionsReact.length);

