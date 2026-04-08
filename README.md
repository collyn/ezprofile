<p align="center">
  <img src="public/icon.png" alt="EzProfile Logo" width="120" height="120">
</p>

<h1 align="center">EzProfile</h1>

<p align="center">
  <strong>Multi Chrome Profile Manager</strong><br>
  Manage multiple Chrome browser profiles with ease — each profile has its own data, proxy, cookies, fingerprint, and browser version.
</p>

<p align="center">
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/v/release/collyn/ezprofile?style=flat-square" alt="Release"></a>
  <a href="https://github.com/collyn/ezprofile/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/downloads/collyn/ezprofile/total?style=flat-square" alt="Downloads"></a>
  <a href="https://github.com/collyn/ezprofile"><img src="https://img.shields.io/github/stars/collyn/ezprofile?style=flat-square" alt="Stars"></a>
</p>

<p align="center">
  <a href="README.vi.md">🇻🇳 Tiếng Việt</a> · <a href="https://github.com/collyn/ezprofile">GitHub</a> · <a href="https://github.com/collyn/ezprofile/releases">Downloads</a> · <a href="https://github.com/collyn/ezprofile/issues">Report Bug</a>
</p>

---

## ✨ Features

### Core Profile Management
- **Multi-Profile Management** — Create, edit, delete, clone, and organize Chrome profiles. Each profile runs in its own isolated `user-data-dir` with fully separate sessions.
- **Profile Cloning** — Duplicate any profile with a single click, preserving cookies, history, and active sessions.
- **Profile Password Protection** — Optionally lock individual profiles with a password. Sensitive operations (launch, clone, export cookies, backup/restore) require authentication.
- **Grid Launch** — Launch multiple selected profiles arranged in an organized grid layout across your screen with customizable dimensions.

### Extension Management
- **Extension Store** — Download extensions directly from the Chrome Web Store via URL or install from local `.zip`/`.crx` files.
- **Auto Updates** — Check and perform updates for installed extensions.
- **Assignments** — Assign extensions per profile or batch-assign to multiple profiles at once.

### Proxy & Network
- **Proxy Support** — Configure HTTP, SOCKS4, or SOCKS5 proxies per profile with built-in proxy checker (IP, country, latency).
- **Proxy Manager** — Centralized proxy CRUD panel with bulk import from clipboard or file, and one-click assignment to profiles.
- **Proxy Toggle** — Enable/disable proxy per profile without removing the configuration.

### Anti-Detect & Fingerprinting
- **CloakBrowser Integration** — Support for CloakBrowser anti-detect Chromium engine with runtime download and automatic management.
- **Fingerprint Settings** — Customize per-profile fingerprint flags: platform, GPU vendor/renderer, screen resolution, hardware concurrency, device memory, timezone, locale, and browser brand.

### Browser Version Management
- **Chrome Version Manager** — Download and manage multiple Chrome versions via [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/), including stable and milestone releases.
- **CloakBrowser Downloads** — Download CloakBrowser builds directly from the app with progress tracking.
- **Default Version** — Set a default browser version for all new profiles.
- **Custom Browser Paths** — Add any Chromium-based browser by selecting its executable path.

### Data, Backup & Cloud Sync
- **Cloud Synchronization** — Automatically sync profiles to Google Drive or AWS S3-compatible storage. Features auto-sync on close and configurable backup retention limits.
- **End-to-End Encryption** — Cloud backups are protected with AES-256-GCM encryption using a custom passphrase, ensuring your data remains private. Settings and credentials are also encrypted at rest locally.
- **Cookie Management** — Import/export cookies in JSON format for any profile.
- **Local Backup & Restore** — Compress a profile's full data to a `.zip` archive and restore it anytime.
- **Import / Export Profiles** — Bulk import/export profile configurations via Excel (`.xlsx`) or JSON.

### Organization & Workflow
- **Group Management** — Organize profiles into color-coded groups; batch-assign groups and proxies.
- **Startup Configuration** — Set per-profile startup behavior: new tab, continue previous session, or open specific URLs.
- **Context Menu** — Rich right-click context menu for quick access to all profile operations.
- **Multi-RDP Session Support** — Correct profile status synchronization across multiple simultaneous Remote Desktop sessions.

### Platform & UI
- **Cross-Platform** — Native support for Windows, macOS, and Linux with platform-specific optimizations.
- **Auto-Updater** — Automatic update checks and in-app updates via GitHub Releases.
- **Multilingual** — Supported in English, Vietnamese, French, and Chinese via `react-i18next`.
- **Modern UI** — Custom frameless title bar with native macOS traffic lights, dark theme, toast notifications, context menus, keyboard shortcuts.

## 🖥️ Supported Platforms

| Platform | Architecture | Format |
|----------|-------------|--------|
| Windows  | x64, arm64  | `.exe` (NSIS installer) |
| macOS    | x64 (Intel), arm64 (Apple Silicon) | `.dmg`, `.zip` |
| Linux    | x64, arm64  | `.AppImage`, `.deb` |

## 📦 Installation

Download the latest release for your platform from the [Releases](https://github.com/collyn/ezprofile/releases) page.

### Windows
Download and run `EzProfile-Setup-x.x.x-win-x64.exe` (or `arm64` variant).

### macOS
Download `EzProfile-x.x.x-mac-x64.dmg` or `EzProfile-x.x.x-mac-arm64.dmg`, open the DMG, and drag EzProfile to your Applications folder.

### Linux
- **AppImage**: Download, make executable (`chmod +x`), and run.
- **Deb**: Install with `sudo dpkg -i EzProfile_x.x.x_amd64.deb`.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Electron](https://www.electronjs.org/) 41 |
| Frontend | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) 6 |
| Bundler | [Vite](https://vitejs.dev/) 8 |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (WAL mode) |
| Browser Automation | [puppeteer-core](https://pptr.dev/) |
| Password Hashing | [bcryptjs](https://github.com/dcodeIO/bcrypt.js) |
| i18n | [react-i18next](https://react.i18next.com/) |
| Build & Packaging | [electron-builder](https://www.electron.build/) |
| Auto-Update | [electron-updater](https://www.electron.build/auto-update) |
| Spreadsheet | [xlsx](https://sheetjs.com/) (SheetJS) |

## 🚀 Development

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) ≥ 9
- Chrome or Chromium installed on your system (for launching profiles)

### Setup

```bash
# Clone the repository
git clone https://github.com/collyn/ezprofile.git
cd ezprofile

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build

```bash
# Build for current platform
npm run dist

# Build for specific platform
npm run dist:win     # Windows
npm run dist:linux   # Linux
npm run dist:mac     # macOS
```

## 📁 Project Structure

```
ezprofile/
├── electron/                # Electron main process
│   ├── main.ts              # App entry, window creation, auto-updater
│   ├── preload.ts           # Context bridge (IPC API)
│   ├── ipc-handlers.ts      # All IPC handler registrations
│   ├── database/            # SQLite schema & migrations
│   │   └── schema.ts
│   ├── services/            # Backend services
│   │   ├── profile-manager.ts         # CRUD + groups + password + settings
│   │   ├── chrome-launcher.ts         # Chrome/CloakBrowser process management
│   │   ├── browser-version-manager.ts # Chrome for Testing & CloakBrowser downloads
│   │   ├── proxy-checker.ts           # Proxy connectivity check
│   │   ├── cookie-manager.ts          # Cookie import/export
│   │   └── backup-manager.ts          # Profile backup/restore
│   └── utils/
│       └── import-export.ts           # Excel/JSON import/export
├── src/                     # React frontend (renderer)
│   ├── App.tsx              # Root component & state management
│   ├── api.ts               # Frontend API wrapper
│   ├── types.ts             # TypeScript type definitions
│   ├── i18n.ts              # i18n configuration
│   ├── locales/             # Translation files (en.json, vi.json)
│   ├── components/          # Reusable UI components
│   │   ├── CreateProfileModal.tsx
│   │   ├── EditProfileModal.tsx
│   │   ├── FingerprintSettings.tsx    # Anti-detect fingerprint config
│   │   ├── PasswordModal.tsx          # Profile password gate
│   │   ├── ProxyManagerModal.tsx      # Centralized proxy management
│   │   ├── BatchAssignGroupModal.tsx
│   │   ├── BatchAssignProxyModal.tsx
│   │   ├── BrowserVersionModal.tsx
│   │   ├── GroupManagerModal.tsx
│   │   ├── ContextMenu.tsx
│   │   └── TitleBar.tsx
│   ├── pages/
│   │   ├── ProfileList.tsx  # Main profile list view
│   │   └── SettingsPage.tsx # Settings & app info
│   └── styles/              # CSS stylesheets
├── scripts/                 # Build helper scripts
│   ├── afterPack.js         # Linux sandbox fix
│   ├── afterInstall.sh      # Deb post-install
│   └── afterRemove.sh       # Deb post-remove
├── public/                  # Static assets (icon)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.electron.json
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Select all profiles |
| `Ctrl+Click` | Select multiple profiles |
| Right-click | Open context menu |
| `Escape` | Close modal / Deselect all |

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- [**CloakBrowser**](https://github.com/CloakHQ/CloakBrowser) — Thank you to the CloakBrowser team for providing an excellent open-source anti-detect Chromium engine. EzProfile's fingerprint spoofing capabilities are powered by CloakBrowser.

## 🔗 Links

- **GitHub**: [https://github.com/collyn/ezprofile](https://github.com/collyn/ezprofile)
- **Releases**: [https://github.com/collyn/ezprofile/releases](https://github.com/collyn/ezprofile/releases)
- **Issues**: [https://github.com/collyn/ezprofile/issues](https://github.com/collyn/ezprofile/issues)
