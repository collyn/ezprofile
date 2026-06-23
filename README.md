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
- **CloakBrowser Integration** — Full support for CloakBrowser anti-detect Chromium engine with runtime download and automatic management.
- **Fingerprint Settings** — Deterministic hardware fingerprinting: seed-based resolution of GPU vendor/renderer, screen resolution, hardware concurrency, device memory, timezone, locale, browser brand, and WebRTC IP spoofing.

### Browser Version Management
- **Chrome Version Manager** — Download and manage multiple Chrome versions via [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/), including stable and milestone releases.
- **CloakBrowser Downloads** — Download CloakBrowser builds directly from GitHub Releases with progress tracking.
- **Default Version** — Set a default browser version for all new profiles.
- **Custom Browser Paths** — Add any Chromium-based browser by selecting its executable path.

### Data, Backup & Cloud Sync
- **Cloud Synchronization** — Automatically sync profiles to Google Drive or AWS S3-compatible storage. Auto-sync on close with configurable backup retention limits.
- **End-to-End Encryption** — Cloud backups protected with AES-256-GCM + PBKDF2 key derivation (`.ezpsync` format). Settings and credentials encrypted at rest.
- **Cookie Management** — Import/export cookies in JSON format for any profile via Chrome DevTools Protocol.
- **Local Backup & Restore** — Compress a profile's full data to a `.zip` archive (skipping caches) and restore anytime.
- **Import / Export Profiles** — Bulk import/export profile configurations via JSON.

### Organization & Workflow
- **Group Management** — Organize profiles into color-coded groups; batch-assign groups and proxies.
- **Startup Configuration** — Set per-profile startup behavior: new tab, continue previous session, or open specific URLs.
- **Context Menu** — Rich right-click context menu for quick access to all profile operations.
- **Keyboard Shortcuts** — `Ctrl+A` select all, `Ctrl+Click` multi-select, `Esc` deselect/close.

### Platform & UI
- **Cross-Platform** — Native support for Windows, macOS, and Linux.
- **Auto-Updater** — Automatic update checks and in-app updates via GitHub Releases (Tauri plugin).
- **Multilingual** — Supported in English, Vietnamese, French, Chinese, Korean, Japanese via `react-i18next`.
- **Modern UI** — Custom frameless title bar with drag region, dark theme, toast notifications.

## 🖥️ Supported Platforms

| Platform | Format |
|----------|--------|
| Windows  | `.exe` (NSIS installer) |
| macOS    | `.dmg` |
| Linux    | `.deb` (Debian/Ubuntu), `.rpm` (Fedora/RHEL) |

## 📦 Installation

Download the latest release from the [Releases](https://github.com/collyn/ezprofile/releases) page.

### Windows
Download and run `EzProfile-Setup-x.x.x-win-x64.exe`.

### macOS
Download `EzProfile-x.x.x-mac-x64.dmg`, open the DMG, and drag EzProfile to Applications.

### Linux
- **Debian/Ubuntu**: `sudo dpkg -i EzProfile_x.x.x_amd64.deb`
- **Fedora/RHEL**: `sudo rpm -i EzProfile-x.x.x-1.x86_64.rpm`

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Tauri](https://tauri.app/) v2 (Rust backend + system webview) |
| Frontend | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) |
| Bundler | [Vite](https://vitejs.dev/) |
| Database | [rusqlite](https://github.com/rusqlite/rusqlite) (SQLite, bundled) |
| Encryption | AES-256-GCM + PBKDF2-HMAC-SHA256 (`aes-gcm`, `pbkdf2`) |
| HTTP | [reqwest](https://docs.rs/reqwest/) + `curl` fallback |
| WebSocket | [tokio-tungstenite](https://docs.rs/tokio-tungstenite/) (CDP) |
| S3 | [rust-s3](https://docs.rs/rust-s3/) |
| Archive | [zip](https://docs.rs/zip/) + [tar](https://docs.rs/tar/) + [flate2](https://docs.rs/flate2/) |
| i18n | [react-i18next](https://react.i18next.com/) |

## 🚀 Development

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/) ≥ 1.80
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- Chrome or Chromium installed on your system (for launching profiles)

### Setup

```bash
git clone https://github.com/collyn/ezprofile.git
cd ezprofile
npm install
npm run dev       # Start Tauri dev server (Vite + Rust)
```

### Build

```bash
npm run build     # Build for current platform (deb + rpm on Linux)
```

## 📁 Project Structure

```
ezprofile/
├── src-tauri/               # Tauri (Rust) backend
│   ├── src/
│   │   ├── main.rs           # App entry point
│   │   ├── lib.rs            # Plugin registration
│   │   ├── backend.rs        # All Tauri commands (~3000 lines)
│   │   ├── gdrive.rs         # Google Drive service (OAuth, up/download)
│   │   └── s3.rs             # S3-compatible storage service
│   ├── Cargo.toml
│   ├── tauri.conf.json       # Tauri configuration
│   ├── capabilities/         # Permission declarations
│   └── icons/                # App icons
├── src/                      # React frontend
│   ├── App.tsx               # Root component & state management
│   ├── api.ts                # Frontend API wrapper
│   ├── tauri-api.ts          # Tauri IPC invoke layer
│   ├── types.ts              # TypeScript type definitions
│   ├── locales/              # Translation files
│   ├── components/           # Reusable UI components
│   │   ├── CreateProfileModal.tsx
│   │   ├── EditProfileModal.tsx
│   │   ├── FingerprintSettings.tsx
│   │   ├── PasswordModal.tsx
│   │   ├── ProxyManagerModal.tsx
│   │   ├── BrowserVersionModal.tsx
│   │   ├── SyncSettingsSection.tsx
│   │   ├── SyncProfileModal.tsx
│   │   ├── ContextMenu.tsx
│   │   └── TitleBar.tsx
│   ├── pages/
│   │   ├── ProfileList.tsx   # Main profile list view
│   │   └── SettingsPage.tsx  # Settings & app info
│   └── styles/               # CSS stylesheets
├── public/                   # Static assets (icon)
├── .github/workflows/        # CI/CD (Tauri build matrix)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Select all profiles |
| `Ctrl+Click` | Add/remove profile from selection |
| Right-click | Open context menu |
| `Escape` | Deselect all / Close context menu |

## 📄 License

MIT License — see [LICENSE](LICENSE).

## 🙏 Acknowledgments

- [**CloakBrowser**](https://github.com/CloakHQ/CloakBrowser) — Open-source anti-detect Chromium engine powering EzProfile's fingerprint capabilities.
- [**Tauri**](https://tauri.app/) — Framework for building tiny, fast desktop apps with web frontends.

## 🔗 Links

- **GitHub**: [https://github.com/collyn/ezprofile](https://github.com/collyn/ezprofile)
- **Releases**: [https://github.com/collyn/ezprofile/releases](https://github.com/collyn/ezprofile/releases)
- **Issues**: [https://github.com/collyn/ezprofile/issues](https://github.com/collyn/ezprofile/issues)
