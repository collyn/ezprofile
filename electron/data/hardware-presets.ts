export interface HardwarePreset {
  id: string;
  name: string;
  category: string;
  platform: string;
  gpuVendor: string;
  gpuRenderer: string;
  screenWidth: string;
  screenHeight: string;
  hardwareConcurrency: string;
  deviceMemory: string;
}

export const HARDWARE_PRESETS: HardwarePreset[] = [
  // ═══════════════════════════════════════════
  // Windows Desktop — NVIDIA
  // ═══════════════════════════════════════════
  { id: 'win-rtx4090-4k', name: 'RTX 4090 · 4K', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4090', screenWidth: '3840', screenHeight: '2160', hardwareConcurrency: '24', deviceMemory: '8' },
  { id: 'win-rtx4090-1440', name: 'RTX 4090 · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4090', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'win-rtx4080-1440', name: 'RTX 4080 · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4080', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'win-rtx4080-4k', name: 'RTX 4080 · 4K', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4080', screenWidth: '3840', screenHeight: '2160', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'win-rtx4070ti-1440', name: 'RTX 4070 Ti · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4070 Ti', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'win-rtx4070-1440', name: 'RTX 4070 · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4070', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'win-rtx4070-1080', name: 'RTX 4070 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4070', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx4060ti-1080', name: 'RTX 4060 Ti · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4060 Ti', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx4060-1080', name: 'RTX 4060 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4060', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx3090-1440', name: 'RTX 3090 · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3090', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'win-rtx3080ti-1440', name: 'RTX 3080 Ti · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3080 Ti', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'win-rtx3080-1440', name: 'RTX 3080 · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3080', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'win-rtx3080-1080', name: 'RTX 3080 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3080', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx3070ti-1440', name: 'RTX 3070 Ti · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3070 Ti', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx3070-1080', name: 'RTX 3070 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3070', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx3060ti-1080', name: 'RTX 3060 Ti · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3060 Ti', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx3060-1080', name: 'RTX 3060 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3060', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-rtx2080ti-1080', name: 'RTX 2080 Ti · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 2080 Ti', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx2080-1080', name: 'RTX 2080 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 2080', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx2070-1080', name: 'RTX 2070 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 2070', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rtx2060-1080', name: 'RTX 2060 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 2060', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-gtx1660ti-1080', name: 'GTX 1660 Ti · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1660 Ti', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-gtx1660-1080', name: 'GTX 1660 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1660', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-gtx1650-1080', name: 'GTX 1650 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1650', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'win-gtx1080ti-1080', name: 'GTX 1080 Ti · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1080 Ti', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-gtx1080-1080', name: 'GTX 1080 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1080', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'win-gtx1070-1080', name: 'GTX 1070 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1070', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'win-gtx1060-1080', name: 'GTX 1060 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1060', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '4' },

  // Windows Desktop — AMD
  { id: 'win-rx7900xtx-1440', name: 'RX 7900 XTX · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7900 XTX, OpenGL 4.6)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'win-rx7900xtx-4k', name: 'RX 7900 XTX · 4K', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7900 XTX, OpenGL 4.6)', screenWidth: '3840', screenHeight: '2160', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'win-rx7900xt-1440', name: 'RX 7900 XT · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7900 XT, OpenGL 4.6)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'win-rx7800xt-1440', name: 'RX 7800 XT · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7800 XT, OpenGL 4.6)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rx7700xt-1080', name: 'RX 7700 XT · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7700 XT, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rx7600-1080', name: 'RX 7600 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7600, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-rx6900xt-1440', name: 'RX 6900 XT · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6900 XT, OpenGL 4.6)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'win-rx6800xt-1440', name: 'RX 6800 XT · 1440p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT, OpenGL 4.6)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rx6700xt-1080', name: 'RX 6700 XT · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-rx6600xt-1080', name: 'RX 6600 XT · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-rx5700xt-1080', name: 'RX 5700 XT · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 5700 XT, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-rx580-1080', name: 'RX 580 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '4' },

  // Windows Desktop — Intel
  { id: 'win-arc-a770', name: 'Arc A770 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Arc A770, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-arc-a750', name: 'Arc A750 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Arc A750, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-uhd770', name: 'UHD 770 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics 770, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'win-uhd730', name: 'UHD 730 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics 730, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'win-uhd630', name: 'UHD 630 · 1080p', category: 'Windows Desktop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics 630, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },

  // ═══════════════════════════════════════════
  // Windows Laptop
  // ═══════════════════════════════════════════
  { id: 'wlap-rtx4080m', name: 'RTX 4080 Laptop · 1440p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4080 Laptop GPU', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'wlap-rtx4070m', name: 'RTX 4070 Laptop · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4070 Laptop GPU', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'wlap-rtx4060m', name: 'RTX 4060 Laptop · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4060 Laptop GPU', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'wlap-rtx4050m', name: 'RTX 4050 Laptop · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4050 Laptop GPU', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'wlap-rtx3070m', name: 'RTX 3070 Laptop · 1440p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3070 Laptop GPU', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'wlap-rtx3060m', name: 'RTX 3060 Laptop · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3060 Laptop GPU', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'wlap-rtx3050m', name: 'RTX 3050 Laptop · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3050 Laptop GPU', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'wlap-rtx2060m', name: 'RTX 2060 Laptop · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 2060', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'wlap-gtx1650m', name: 'GTX 1650 Laptop · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1650', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'wlap-iris-xe-i7', name: 'Iris Xe (i7) · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Iris Xe Graphics, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'wlap-iris-xe-i5', name: 'Iris Xe (i5) · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Iris Xe Graphics, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'wlap-iris-plus', name: 'Iris Plus · 1080p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Iris Plus Graphics, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'wlap-uhd620-768', name: 'UHD 620 · 768p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics 620, OpenGL 4.6)', screenWidth: '1366', screenHeight: '768', hardwareConcurrency: '4', deviceMemory: '4' },
  { id: 'wlap-surface-pro', name: 'Surface Pro · 2736×1824', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Iris Xe Graphics, OpenGL 4.6)', screenWidth: '2736', screenHeight: '1824', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'wlap-surface-laptop', name: 'Surface Laptop · 2256×1504', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Iris Xe Graphics, OpenGL 4.6)', screenWidth: '2256', screenHeight: '1504', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'wlap-dell-xps15', name: 'Dell XPS 15 · 3840×2400', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3050 Laptop GPU', screenWidth: '3840', screenHeight: '2400', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'wlap-thinkpad-768', name: 'ThinkPad · 1366×768', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics 630, OpenGL 4.6)', screenWidth: '1366', screenHeight: '768', hardwareConcurrency: '4', deviceMemory: '4' },
  { id: 'wlap-budget-768', name: 'Budget Laptop · 768p', category: 'Windows Laptop', platform: 'windows', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics 600, OpenGL 4.6)', screenWidth: '1366', screenHeight: '768', hardwareConcurrency: '2', deviceMemory: '4' },

  // ═══════════════════════════════════════════
  // macOS — Apple Silicon
  // ═══════════════════════════════════════════
  { id: 'mac-mbp16-m3max', name: 'MacBook Pro 16″ M3 Max', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', screenWidth: '3456', screenHeight: '2234', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'mac-mbp14-m3max', name: 'MacBook Pro 14″ M3 Max', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', screenWidth: '3024', screenHeight: '1964', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'mac-mbp16-m3pro', name: 'MacBook Pro 16″ M3 Pro', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)', screenWidth: '3456', screenHeight: '2234', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'mac-mbp14-m3pro', name: 'MacBook Pro 14″ M3 Pro', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)', screenWidth: '3024', screenHeight: '1964', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'mac-mbp14-m3', name: 'MacBook Pro 14″ M3', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', screenWidth: '3024', screenHeight: '1964', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mba15-m3', name: 'MacBook Air 15″ M3', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', screenWidth: '2880', screenHeight: '1864', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mba13-m3', name: 'MacBook Air 13″ M3', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', screenWidth: '2560', screenHeight: '1664', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mbp16-m2max', name: 'MacBook Pro 16″ M2 Max', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)', screenWidth: '3456', screenHeight: '2234', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'mac-mbp14-m2pro', name: 'MacBook Pro 14″ M2 Pro', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)', screenWidth: '3024', screenHeight: '1964', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'mac-mbp13-m2', name: 'MacBook Pro 13″ M2', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', screenWidth: '2560', screenHeight: '1600', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mba15-m2', name: 'MacBook Air 15″ M2', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', screenWidth: '2880', screenHeight: '1864', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mba13-m2', name: 'MacBook Air 13″ M2', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', screenWidth: '2560', screenHeight: '1664', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mbp13-m1', name: 'MacBook Pro 13″ M1', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', screenWidth: '2560', screenHeight: '1600', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mba13-m1', name: 'MacBook Air 13″ M1', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', screenWidth: '2560', screenHeight: '1600', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-imac24-m3', name: 'iMac 24″ M3', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', screenWidth: '4480', screenHeight: '2520', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-studio-m2u', name: 'Mac Studio M2 Ultra', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Ultra, Unspecified Version)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '24', deviceMemory: '8' },
  { id: 'mac-mini-m2', name: 'Mac Mini M2', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mini-m1', name: 'Mac Mini M1', category: 'macOS', platform: 'macos', gpuVendor: 'Google Inc. (Apple)', gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },

  // macOS — Intel
  { id: 'mac-mbp16-i9', name: 'MacBook Pro 16″ Intel i9', category: 'macOS', platform: 'macos', gpuVendor: 'Intel Inc.', gpuRenderer: 'Intel UHD Graphics 630', screenWidth: '3072', screenHeight: '1920', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'mac-mbp13-i5', name: 'MacBook Pro 13″ Intel i5', category: 'macOS', platform: 'macos', gpuVendor: 'Intel Inc.', gpuRenderer: 'Intel Iris Plus Graphics', screenWidth: '2560', screenHeight: '1600', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'mac-mba13-i5', name: 'MacBook Air 13″ Intel i5', category: 'macOS', platform: 'macos', gpuVendor: 'Intel Inc.', gpuRenderer: 'Intel Iris Plus Graphics', screenWidth: '1440', screenHeight: '900', hardwareConcurrency: '4', deviceMemory: '4' },
  { id: 'mac-imac27-i7', name: 'iMac 27″ Intel i7', category: 'macOS', platform: 'macos', gpuVendor: 'Intel Inc.', gpuRenderer: 'Intel UHD Graphics 630', screenWidth: '5120', screenHeight: '2880', hardwareConcurrency: '8', deviceMemory: '8' },

  // ═══════════════════════════════════════════
  // Linux
  // ═══════════════════════════════════════════
  { id: 'lin-rtx4090-1440', name: 'RTX 4090 · 1440p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4090', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '24', deviceMemory: '8' },
  { id: 'lin-rtx4070-1440', name: 'RTX 4070 · 1440p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 4070', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'lin-rtx3080-1440', name: 'RTX 3080 · 1440p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3080', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '12', deviceMemory: '8' },
  { id: 'lin-rtx3070-1080', name: 'RTX 3070 · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3070', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'lin-rtx3060-1080', name: 'RTX 3060 · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 3060', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'lin-rtx2080-1080', name: 'RTX 2080 · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce RTX 2080', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'lin-gtx1080-1080', name: 'GTX 1080 · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1080', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'lin-gtx1060-1080', name: 'GTX 1060 · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'NVIDIA GeForce GTX 1060', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '4' },
  { id: 'lin-rx7900xtx-1440', name: 'RX 7900 XTX · 1440p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7900 XTX, OpenGL 4.6)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '16', deviceMemory: '8' },
  { id: 'lin-rx6800xt-1440', name: 'RX 6800 XT · 1440p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT, OpenGL 4.6)', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'lin-rx6700xt-1080', name: 'RX 6700 XT · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'lin-rx5700xt-1080', name: 'RX 5700 XT · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (AMD)', gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 5700 XT, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '6', deviceMemory: '8' },
  { id: 'lin-arc-a770', name: 'Arc A770 · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Arc A770, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'lin-iris-xe', name: 'Iris Xe · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel Iris Xe Graphics, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '8', deviceMemory: '8' },
  { id: 'lin-uhd630', name: 'UHD 630 · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics 630, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '4', deviceMemory: '8' },
  { id: 'lin-server-xeon', name: 'Server Xeon · 1080p', category: 'Linux', platform: 'linux', gpuVendor: 'Google Inc. (Intel)', gpuRenderer: 'ANGLE (Intel, Intel UHD Graphics P630, OpenGL 4.6)', screenWidth: '1920', screenHeight: '1080', hardwareConcurrency: '32', deviceMemory: '8' },
  { id: 'lin-workstation', name: 'Workstation Quadro · 1440p', category: 'Linux', platform: 'linux', gpuVendor: 'NVIDIA Corporation', gpuRenderer: 'Quadro RTX 5000', screenWidth: '2560', screenHeight: '1440', hardwareConcurrency: '16', deviceMemory: '8' },
];

// Get unique categories in order
export const PRESET_CATEGORIES = [...new Set(HARDWARE_PRESETS.map(p => p.category))];

// GPU options organized by platform compatibility
export const GPU_BY_PLATFORM: Record<string, { vendor: string; renderers: string[] }[]> = {
  windows: [
    { vendor: 'NVIDIA Corporation', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'windows' && p.gpuVendor === 'NVIDIA Corporation').map(p => p.gpuRenderer))] },
    { vendor: 'Google Inc. (AMD)', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'windows' && p.gpuVendor === 'Google Inc. (AMD)').map(p => p.gpuRenderer))] },
    { vendor: 'Google Inc. (Intel)', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'windows' && p.gpuVendor === 'Google Inc. (Intel)').map(p => p.gpuRenderer))] },
  ],
  macos: [
    { vendor: 'Google Inc. (Apple)', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'macos' && p.gpuVendor === 'Google Inc. (Apple)').map(p => p.gpuRenderer))] },
    { vendor: 'Intel Inc.', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'macos' && p.gpuVendor === 'Intel Inc.').map(p => p.gpuRenderer))] },
  ],
  linux: [
    { vendor: 'NVIDIA Corporation', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'linux' && p.gpuVendor === 'NVIDIA Corporation').map(p => p.gpuRenderer))] },
    { vendor: 'Google Inc. (AMD)', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'linux' && p.gpuVendor === 'Google Inc. (AMD)').map(p => p.gpuRenderer))] },
    { vendor: 'Google Inc. (Intel)', renderers: [...new Set(HARDWARE_PRESETS.filter(p => p.platform === 'linux' && p.gpuVendor === 'Google Inc. (Intel)').map(p => p.gpuRenderer))] },
  ],
};

// Screen resolutions used in presets, per platform
export const SCREENS_BY_PLATFORM: Record<string, { w: string; h: string; label: string }[]> = {
  windows: [
    { w: '3840', h: '2400', label: '3840 × 2400 (4K+)' },
    { w: '3840', h: '2160', label: '3840 × 2160 (4K)' },
    { w: '2736', h: '1824', label: '2736 × 1824 (Surface Pro)' },
    { w: '2560', h: '1440', label: '2560 × 1440 (2K)' },
    { w: '2256', h: '1504', label: '2256 × 1504 (Surface)' },
    { w: '1920', h: '1080', label: '1920 × 1080 (FHD)' },
    { w: '1600', h: '900', label: '1600 × 900' },
    { w: '1536', h: '864', label: '1536 × 864' },
    { w: '1366', h: '768', label: '1366 × 768 (HD)' },
  ],
  macos: [
    { w: '5120', h: '2880', label: '5120 × 2880 (iMac 27″)' },
    { w: '4480', h: '2520', label: '4480 × 2520 (iMac 24″)' },
    { w: '3456', h: '2234', label: '3456 × 2234 (MBP 16″)' },
    { w: '3072', h: '1920', label: '3072 × 1920 (MBP 16″ Intel)' },
    { w: '3024', h: '1964', label: '3024 × 1964 (MBP 14″)' },
    { w: '2880', h: '1864', label: '2880 × 1864 (MBA 15″)' },
    { w: '2880', h: '1800', label: '2880 × 1800 (MBP 15″ Intel)' },
    { w: '2560', h: '1664', label: '2560 × 1664 (MBA 13″)' },
    { w: '2560', h: '1600', label: '2560 × 1600 (MBP 13″)' },
    { w: '2560', h: '1440', label: '2560 × 1440 (External)' },
    { w: '1920', h: '1080', label: '1920 × 1080 (External)' },
    { w: '1440', h: '900', label: '1440 × 900 (MBA Intel)' },
  ],
  linux: [
    { w: '3840', h: '2160', label: '3840 × 2160 (4K)' },
    { w: '2560', h: '1440', label: '2560 × 1440 (2K)' },
    { w: '1920', h: '1080', label: '1920 × 1080 (FHD)' },
    { w: '1366', h: '768', label: '1366 × 768 (HD)' },
  ],
};
