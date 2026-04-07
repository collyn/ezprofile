import { GPU_BY_PLATFORM } from './src/data/hardware-presets';

const currentPlatform = '';
const rawGpuOptions = currentPlatform && GPU_BY_PLATFORM[currentPlatform]
  ? GPU_BY_PLATFORM[currentPlatform]
  : [...(GPU_BY_PLATFORM.windows || []), ...(GPU_BY_PLATFORM.macos || []), ...(GPU_BY_PLATFORM.linux || [])];
  
const acc = {} as any;
rawGpuOptions.forEach(curr => {
  if (!acc[curr.vendor]) acc[curr.vendor] = { vendor: curr.vendor, renderers: [] };
  acc[curr.vendor].renderers.push(...curr.renderers);
});
const gpuOptions = Object.values(acc);

console.log("gpuOptions length:", gpuOptions.length);
console.log("unique vendors:", new Set(gpuOptions.map((g: any) => g.vendor)).size);

const renderers = gpuOptions.flatMap((g: any) => g.renderers);
console.log("total renderers:", renderers.length);
console.log("unique renderers:", new Set(renderers).size);

