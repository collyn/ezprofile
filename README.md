<p align="center">
  <img src="public/icon.png" alt="EzProfile Logo" width="120" height="120">
</p>

<h1 align="center">EzProfile</h1>

<p align="center">
  <strong>Multi Chrome Profile Manager</strong><br>
  Manage multiple Chrome browser profiles with ease — each profile has its own data, proxy, cookies, and browser version.
</p>

<p align="center">
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/v/release/collyn/ezprofile?style=flat-square" alt="Release"></a>
  <a href="https://github.com/collyn/ezprofile/blob/main/LICENSE"><img src="https://img.shields.io/github/license/collyn/ezprofile?style=flat-square" alt="License"></a>
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/downloads/collyn/ezprofile/total?style=flat-square" alt="Downloads"></a>
</p>

<p align="center">
  <a href="README.vi.md">🇻🇳 Tiếng Việt</a>
</p>

---

## ✨ Features

- **Multi-Profile Management** — Create, edit, delete, and organize Chrome profiles. Each profile runs in its own isolated `user-data-dir`.
- **Proxy Support** — Configure HTTP, SOCKS4, or SOCKS5 proxies per profile with built-in proxy checker.
- **Cookie Management** — Import/export cookies in JSON format for any profile.
- **Backup & Restore** — Compress a profile's data to a `.zip` archive and restore it anytime.
- **Chrome Version Manager** — Download and manage multiple Chrome versions (via [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/)). Each profile can use a different Chrome version.
- **Group Management** — Organize profiles into color-coded groups; batch-assign groups and proxies.
- **Import / Export Profiles** — Bulk import/export profile configurations via Excel (`.xlsx`) or JSON.
- **Startup Configuration** — Set per-profile startup behavior: new tab, continue previous session, or open specific URLs.
- **Auto-Updater** — Automatic update checks and in-app updates via GitHub Releases.
- **Multilingual** — English and Vietnamese UI with `react-i18next`.
- **Modern UI** — Custom frameless title bar, dark theme, toast notifications, context menus, keyboard shortcuts.

## 🖥️ Supported Platforms

| Platform | Architecture | Format |
|----------|-------------|--------|
| Windows  | x64, arm64  | `.exe` (NSIS installer) |
| macOS    | x64 (Intel), arm64 (Apple Silicon) | `.dmg` |
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
| Framework | [Electron](https://www.electronjs.org/) 35 |
| Frontend | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) |
| Bundler | [Vite](https://vitejs.dev/) 6 |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Browser Automation | [puppeteer-core](https://pptr.dev/) |
| i18n | [react-i18next](https://react.i18next.com/) |
| Build & Packaging | [electron-builder](https://www.electron.build/) |
| Auto-Update | [electron-updater](https://www.electron.build/auto-update) |

## 🚀 Development

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) ≥ 9
- Chrome or Chromium installed on your system (for launching profiles)

### Setup

```bash
# Clone the repository
git clone https://github.com/ezprofile/ezprofile.git
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
├── electron/               # Electron main process
│   ├── main.ts             # App entry, window creation, auto-updater
│   ├── preload.ts          # Context bridge (IPC API)
│   ├── ipc-handlers.ts     # All IPC handler registrations
│   ├── database/           # SQLite schema
│   │   └── schema.ts
│   ├── services/           # Backend services
│   │   ├── profile-manager.ts        # CRUD + groups + settings
│   │   ├── chrome-launcher.ts        # Chrome process management
│   │   ├── browser-version-manager.ts# Chrome for Testing downloads
│   │   ├── proxy-checker.ts          # Proxy connectivity check
│   │   ├── cookie-manager.ts         # Cookie import/export
│   │   └── backup-manager.ts         # Profile backup/restore
│   └── utils/
│       └── import-export.ts          # Excel/JSON import/export
├── src/                    # React frontend (renderer)
│   ├── App.tsx             # Root component & state management
│   ├── api.ts              # Frontend API wrapper
│   ├── types.ts            # TypeScript type definitions
│   ├── i18n.ts             # i18n configuration
│   ├── locales/            # Translation files (en.json, vi.json)
│   ├── components/         # Reusable UI components
│   │   ├── CreateProfileModal.tsx
│   │   ├── EditProfileModal.tsx
│   │   ├── BatchAssignGroupModal.tsx
│   │   ├── BatchAssignProxyModal.tsx
│   │   ├── BrowserVersionModal.tsx
│   │   ├── GroupManagerModal.tsx
│   │   ├── ContextMenu.tsx
│   │   └── TitleBar.tsx
│   ├── pages/
│   │   ├── ProfileList.tsx   # Main profile list view
│   │   └── SettingsPage.tsx  # Settings & app info
│   └── styles/              # CSS stylesheets
├── scripts/                # Build helper scripts
│   ├── afterPack.js        # Linux sandbox fix
│   ├── afterInstall.sh     # Deb post-install
│   └── afterRemove.sh      # Deb post-remove
├── public/                 # Static assets (icon)
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
