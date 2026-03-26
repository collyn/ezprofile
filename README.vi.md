<p align="center">
  <img src="public/icon.png" alt="EzProfile Logo" width="120" height="120">
</p>

<h1 align="center">EzProfile</h1>

<p align="center">
  <strong>Trình quản lý đa Profile Chrome</strong><br>
  Quản lý nhiều profile trình duyệt Chrome một cách dễ dàng — mỗi profile có dữ liệu riêng, proxy riêng, cookie riêng và phiên bản Chrome riêng.
</p>

<p align="center">
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/v/release/ezprofile/ezprofile?style=flat-square" alt="Release"></a>
  <a href="https://github.com/ezprofile/ezprofile/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ezprofile/ezprofile?style=flat-square" alt="License"></a>
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/downloads/ezprofile/ezprofile/total?style=flat-square" alt="Downloads"></a>
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a>
</p>

---

## ✨ Tính năng

- **Quản lý đa Profile** — Tạo, chỉnh sửa, xóa và tổ chức các profile Chrome. Mỗi profile chạy trong thư mục `user-data-dir` riêng biệt.
- **Hỗ trợ Proxy** — Cấu hình proxy HTTP, SOCKS4, hoặc SOCKS5 cho từng profile với công cụ kiểm tra proxy tích hợp.
- **Quản lý Cookie** — Import/export cookie dạng JSON cho bất kỳ profile nào.
- **Sao lưu & Khôi phục** — Nén dữ liệu profile thành file `.zip` và khôi phục bất cứ lúc nào.
- **Quản lý phiên bản Chrome** — Tải và quản lý nhiều phiên bản Chrome (qua [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/)). Mỗi profile có thể sử dụng phiên bản Chrome khác nhau.
- **Quản lý nhóm** — Tổ chức profile theo nhóm với màu sắc riêng; gán nhóm và proxy hàng loạt.
- **Import / Export Profile** — Import/export cấu hình profile hàng loạt qua Excel (`.xlsx`) hoặc JSON.
- **Cấu hình khởi động** — Thiết lập hành vi khởi động cho từng profile: tab mới, tiếp tục phiên trước, hoặc mở các URL cụ thể.
- **Tự động cập nhật** — Tự động kiểm tra và cập nhật ứng dụng qua GitHub Releases.
- **Đa ngôn ngữ** — Giao diện tiếng Anh và tiếng Việt với `react-i18next`.
- **Giao diện hiện đại** — Thanh tiêu đề tùy chỉnh, giao diện tối, thông báo toast, menu ngữ cảnh, phím tắt.

## 🖥️ Nền tảng hỗ trợ

| Nền tảng | Kiến trúc CPU | Định dạng |
|----------|-------------|-----------|
| Windows  | x64, arm64  | `.exe` (NSIS installer) |
| macOS    | x64 (Intel), arm64 (Apple Silicon) | `.dmg` |
| Linux    | x64, arm64  | `.AppImage`, `.deb` |

## 📦 Cài đặt

Tải phiên bản mới nhất cho hệ điều hành của bạn từ trang [Releases](https://github.com/collyn/ezprofile/releases).

### Windows
Tải và chạy file `EzProfile-Setup-x.x.x-win-x64.exe` (hoặc phiên bản `arm64`).

### macOS
Tải `EzProfile-x.x.x-mac-x64.dmg` hoặc `EzProfile-x.x.x-mac-arm64.dmg`, mở file DMG và kéo EzProfile vào thư mục Applications.

### Linux
- **AppImage**: Tải về, cấp quyền thực thi (`chmod +x`) và chạy.
- **Deb**: Cài đặt bằng lệnh `sudo dpkg -i EzProfile_x.x.x_amd64.deb`.

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
|-----------|-----------|
| Framework | [Electron](https://www.electronjs.org/) 35 |
| Frontend | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) |
| Bundler | [Vite](https://vitejs.dev/) 6 |
| Cơ sở dữ liệu | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Tự động hóa trình duyệt | [puppeteer-core](https://pptr.dev/) |
| Đa ngôn ngữ | [react-i18next](https://react.i18next.com/) |
| Đóng gói | [electron-builder](https://www.electron.build/) |
| Tự động cập nhật | [electron-updater](https://www.electron.build/auto-update) |

## 🚀 Phát triển

### Yêu cầu

- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) ≥ 9
- Chrome hoặc Chromium đã được cài đặt trên máy (để khởi chạy profile)

### Cài đặt

```bash
# Clone repository
git clone https://github.com/ezprofile/ezprofile.git
cd ezprofile

# Cài đặt dependencies
npm install

# Khởi chạy ở chế độ phát triển
npm run dev
```

### Build

```bash
# Build cho nền tảng hiện tại
npm run dist

# Build cho nền tảng cụ thể
npm run dist:win     # Windows
npm run dist:linux   # Linux
npm run dist:mac     # macOS
```

## 📁 Cấu trúc dự án

```
ezprofile/
├── electron/               # Electron main process
│   ├── main.ts             # Khởi tạo app, cửa sổ, auto-updater
│   ├── preload.ts          # Context bridge (IPC API)
│   ├── ipc-handlers.ts     # Đăng ký các IPC handler
│   ├── database/           # Schema SQLite
│   │   └── schema.ts
│   ├── services/           # Các service backend
│   │   ├── profile-manager.ts        # CRUD + nhóm + cài đặt
│   │   ├── chrome-launcher.ts        # Quản lý tiến trình Chrome
│   │   ├── browser-version-manager.ts# Tải Chrome for Testing
│   │   ├── proxy-checker.ts          # Kiểm tra kết nối proxy
│   │   ├── cookie-manager.ts         # Import/export cookie
│   │   └── backup-manager.ts         # Sao lưu/khôi phục profile
│   └── utils/
│       └── import-export.ts          # Import/export Excel/JSON
├── src/                    # React frontend (renderer)
│   ├── App.tsx             # Component gốc & quản lý state
│   ├── api.ts              # Wrapper API cho frontend
│   ├── types.ts            # Định nghĩa TypeScript types
│   ├── i18n.ts             # Cấu hình i18n
│   ├── locales/            # File dịch (en.json, vi.json)
│   ├── components/         # Các component UI
│   │   ├── CreateProfileModal.tsx
│   │   ├── EditProfileModal.tsx
│   │   ├── BatchAssignGroupModal.tsx
│   │   ├── BatchAssignProxyModal.tsx
│   │   ├── BrowserVersionModal.tsx
│   │   ├── GroupManagerModal.tsx
│   │   ├── ContextMenu.tsx
│   │   └── TitleBar.tsx
│   ├── pages/
│   │   ├── ProfileList.tsx   # Trang danh sách profile chính
│   │   └── SettingsPage.tsx  # Trang cài đặt & thông tin app
│   └── styles/              # CSS stylesheets
├── scripts/                # Script hỗ trợ build
│   ├── afterPack.js        # Sửa lỗi sandbox Linux
│   ├── afterInstall.sh     # Script sau khi cài deb
│   └── afterRemove.sh      # Script sau khi gỡ deb
├── public/                 # Tài nguyên tĩnh (icon)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.electron.json
```

## ⌨️ Phím tắt

| Phím tắt | Hành động |
|----------|-----------|
| `Ctrl+A` | Chọn tất cả profile |
| `Ctrl+Click` | Chọn nhiều profile |
| Chuột phải | Mở menu ngữ cảnh |
| `Escape` | Đóng modal / Bỏ chọn tất cả |

## 📄 Giấy phép

Dự án này được cấp phép theo [MIT License](LICENSE).

## 🤝 Đóng góp

Rất hoan nghênh mọi đóng góp! Vui lòng tạo Pull Request.

1. Fork repository
2. Tạo nhánh tính năng (`git checkout -b feature/tinh-nang-moi`)
3. Commit thay đổi (`git commit -m 'Thêm tính năng mới'`)
4. Push lên nhánh (`git push origin feature/tinh-nang-moi`)
5. Tạo Pull Request
