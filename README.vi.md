<p align="center">
  <img src="public/icon.png" alt="EzProfile Logo" width="120" height="120">
</p>

<h1 align="center">EzProfile</h1>

<p align="center">
  <strong>Trình quản lý đa Profile Chrome</strong><br>
  Quản lý nhiều profile trình duyệt Chrome một cách dễ dàng — mỗi profile có dữ liệu riêng, proxy riêng, cookie riêng, fingerprint riêng và phiên bản Chrome riêng.
</p>

<p align="center">
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/v/release/collyn/ezprofile?style=flat-square" alt="Release"></a>
  <a href="https://github.com/collyn/ezprofile/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/collyn/ezprofile/releases"><img src="https://img.shields.io/github/downloads/collyn/ezprofile/total?style=flat-square" alt="Downloads"></a>
  <a href="https://github.com/collyn/ezprofile"><img src="https://img.shields.io/github/stars/collyn/ezprofile?style=flat-square" alt="Stars"></a>
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> · <a href="https://github.com/collyn/ezprofile">GitHub</a> · <a href="https://github.com/collyn/ezprofile/releases">Tải về</a> · <a href="https://github.com/collyn/ezprofile/issues">Báo lỗi</a>
</p>

---

## ✨ Tính năng

### Quản lý Profile
- **Quản lý đa Profile** — Tạo, chỉnh sửa, xóa, nhân bản và tổ chức các profile Chrome. Mỗi profile chạy trong thư mục `user-data-dir` riêng biệt với phiên đăng nhập hoàn toàn độc lập.
- **Nhân bản Profile** — Sao chép bất kỳ profile nào chỉ với một cú nhấp, giữ nguyên cookie, lịch sử và phiên đăng nhập.
- **Bảo vệ Profile bằng mật khẩu** — Tùy chọn khóa profile bằng mật khẩu. Các thao tác nhạy cảm (khởi chạy, nhân bản, xuất cookie, sao lưu/khôi phục) yêu cầu xác thực.
- **Khởi chạy dạng Lưới (Grid Launch)** — Khởi chạy đồng thời nhiều profile được sắp xếp tự động theo dạng lưới trên màn hình với kích thước tùy chỉnh.

### Quản lý Tiện ích mở rộng
- **Cửa hàng Tiện ích** — Tải xuống extension trực tiếp từ Chrome Web Store qua URL hoặc cài đặt từ file `.zip`/`.crx` nội bộ.
- **Tự động cập nhật** — Kiểm tra và thực hiện cập nhật cho các extension đã cài đặt.
- **Gán cho Profile** — Gán extension cho từng profile hoặc gán hàng loạt cho nhiều profile cùng lúc.

### Proxy & Mạng
- **Hỗ trợ Proxy** — Cấu hình proxy HTTP, SOCKS4, hoặc SOCKS5 cho từng profile với công cụ kiểm tra proxy tích hợp (IP, quốc gia, độ trễ).
- **Quản lý Proxy tập trung** — Panel CRUD proxy cho phép import hàng loạt từ clipboard hoặc file, gán nhanh cho profile.
- **Bật/tắt Proxy** — Bật hoặc tắt proxy theo từng profile mà không cần xóa cấu hình.

### Anti-Detect & Fingerprint
- **Tích hợp CloakBrowser** — Hỗ trợ đầy đủ trình duyệt anti-detect CloakBrowser với tải xuống tự động và quản lý trực tiếp trong app.
- **Cài đặt Fingerprint** — Giả lập phần cứng xác định từ seed: GPU vendor/renderer, độ phân giải màn hình, hardware concurrency, device memory, timezone, locale, brand trình duyệt và WebRTC IP spoofing.

### Quản lý phiên bản trình duyệt
- **Chrome Version Manager** — Tải và quản lý nhiều phiên bản Chrome qua [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/), bao gồm các bản stable và milestone.
- **Tải CloakBrowser** — Tải các bản build CloakBrowser trực tiếp từ GitHub Releases với theo dõi tiến trình.
- **Phiên bản mặc định** — Thiết lập phiên bản trình duyệt mặc định cho tất cả profile mới.
- **Đường dẫn trình duyệt tùy chỉnh** — Thêm bất kỳ trình duyệt Chromium nào bằng cách chọn file thực thi.

### Dữ liệu, Sao lưu & Đồng bộ Đám mây
- **Đồng bộ Đám mây** — Tự động đồng bộ dữ liệu profile lên Google Drive hoặc AWS S3. Hỗ trợ tự động đồng bộ khi đóng profile và giới hạn số lượng bản sao lưu.
- **Mã hóa đầu cuối** — Sao lưu đám mây được bảo vệ bằng AES-256-GCM + PBKDF2 (định dạng `.ezpsync`). Cấu hình và thông tin xác thực được mã hóa cục bộ.
- **Quản lý Cookie** — Import/export cookie dạng JSON qua Chrome DevTools Protocol.
- **Sao lưu & Khôi phục cục bộ** — Nén dữ liệu profile thành file `.zip` (bỏ qua cache) và khôi phục bất cứ lúc nào.
- **Import / Export Profile** — Import/export cấu hình profile hàng loạt qua JSON.

### Tổ chức & Quy trình làm việc
- **Quản lý nhóm** — Tổ chức profile theo nhóm với màu sắc riêng; gán nhóm và proxy hàng loạt.
- **Cấu hình khởi động** — Thiết lập hành vi khởi động: tab mới, tiếp tục phiên trước, hoặc mở URL cụ thể.
- **Menu ngữ cảnh** — Menu chuột phải đầy đủ để truy cập nhanh mọi thao tác.
- **Phím tắt** — `Ctrl+A` chọn tất cả, `Ctrl+Click` chọn nhiều, `Esc` bỏ chọn/đóng.

### Nền tảng & Giao diện
- **Đa nền tảng** — Hỗ trợ Windows, macOS và Linux.
- **Tự động cập nhật** — Kiểm tra và cập nhật ứng dụng qua GitHub Releases (Tauri plugin).
- **Đa ngôn ngữ** — Hỗ trợ tiếng Anh, tiếng Việt, tiếng Pháp, tiếng Trung, tiếng Hàn, tiếng Nhật.
- **Giao diện hiện đại** — Thanh tiêu đề tùy chỉnh có thể kéo, giao diện tối, thông báo toast.

## 🖥️ Nền tảng hỗ trợ

| Nền tảng | Định dạng |
|----------|-----------|
| Windows  | `.exe` (NSIS installer) |
| macOS    | `.dmg` |
| Linux    | `.deb` (Debian/Ubuntu), `.rpm` (Fedora/RHEL) |

## 📦 Cài đặt

Tải phiên bản mới nhất từ trang [Releases](https://github.com/collyn/ezprofile/releases).

### Windows
Tải và chạy file `EzProfile-Setup-x.x.x-win-x64.exe`.

### macOS
Tải `EzProfile-x.x.x-mac-x64.dmg`, mở file DMG và kéo EzProfile vào thư mục Applications.

### Linux
- **Debian/Ubuntu**: `sudo dpkg -i EzProfile_x.x.x_amd64.deb`
- **Fedora/RHEL**: `sudo rpm -i EzProfile-x.x.x-1.x86_64.rpm`

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
|-----------|-----------|
| Runtime | [Tauri](https://tauri.app/) v2 (Rust backend + system webview) |
| Frontend | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) |
| Bundler | [Vite](https://vitejs.dev/) |
| Cơ sở dữ liệu | [rusqlite](https://github.com/rusqlite/rusqlite) (SQLite, bundled) |
| Mã hóa | AES-256-GCM + PBKDF2-HMAC-SHA256 (`aes-gcm`, `pbkdf2`) |
| HTTP | [reqwest](https://docs.rs/reqwest/) + `curl` |
| WebSocket | [tokio-tungstenite](https://docs.rs/tokio-tungstenite/) (CDP) |
| S3 | [rust-s3](https://docs.rs/rust-s3/) |
| Nén/Giải nén | [zip](https://docs.rs/zip/) + [tar](https://docs.rs/tar/) + [flate2](https://docs.rs/flate2/) |
| Đa ngôn ngữ | [react-i18next](https://react.i18next.com/) |

## 🚀 Phát triển

### Yêu cầu

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/) ≥ 1.80
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- Chrome hoặc Chromium đã được cài đặt trên máy (để khởi chạy profile)

### Cài đặt

```bash
git clone https://github.com/collyn/ezprofile.git
cd ezprofile
npm install
npm run dev       # Khởi chạy Tauri dev server (Vite + Rust)
```

### Build

```bash
npm run build     # Build cho nền tảng hiện tại (deb + rpm trên Linux)
```

## 📁 Cấu trúc dự án

```
ezprofile/
├── src-tauri/               # Tauri (Rust) backend
│   ├── src/
│   │   ├── main.rs           # Khởi tạo app
│   │   ├── lib.rs            # Đăng ký plugin
│   │   ├── backend.rs        # Tất cả Tauri commands (~3000 dòng)
│   │   ├── gdrive.rs         # Google Drive service (OAuth, up/download)
│   │   └── s3.rs             # S3-compatible storage service
│   ├── Cargo.toml
│   ├── tauri.conf.json       # Cấu hình Tauri
│   ├── capabilities/         # Khai báo quyền
│   └── icons/                # Icon ứng dụng
├── src/                      # React frontend
│   ├── App.tsx               # Component gốc & quản lý state
│   ├── api.ts                # Wrapper API cho frontend
│   ├── tauri-api.ts          # Lớp gọi Tauri IPC
│   ├── types.ts              # Định nghĩa TypeScript types
│   ├── locales/              # File dịch
│   ├── components/           # Các component UI
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
│   │   ├── ProfileList.tsx   # Trang danh sách profile chính
│   │   └── SettingsPage.tsx  # Trang cài đặt & thông tin app
│   └── styles/               # CSS stylesheets
├── public/                   # Tài nguyên tĩnh (icon)
├── .github/workflows/        # CI/CD (Tauri build matrix)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## ⌨️ Phím tắt

| Phím tắt | Hành động |
|----------|-----------|
| `Ctrl+A` | Chọn tất cả profile |
| `Ctrl+Click` | Thêm/bỏ profile khỏi lựa chọn |
| Chuột phải | Mở menu ngữ cảnh |
| `Escape` | Bỏ chọn tất cả / Đóng menu |

## 📄 Giấy phép

Dự án này được cấp phép theo [MIT License](LICENSE).

## 🙏 Lời cảm ơn

- [**CloakBrowser**](https://github.com/CloakHQ/CloakBrowser) — Engine Chromium anti-detect mã nguồn mở, nền tảng cho khả năng fingerprint của EzProfile.
- [**Tauri**](https://tauri.app/) — Framework xây dựng ứng dụng desktop nhỏ gọn, nhanh với web frontend.

## 🔗 Liên kết

- **GitHub**: [https://github.com/collyn/ezprofile](https://github.com/collyn/ezprofile)
- **Tải về**: [https://github.com/collyn/ezprofile/releases](https://github.com/collyn/ezprofile/releases)
- **Báo lỗi**: [https://github.com/collyn/ezprofile/issues](https://github.com/collyn/ezprofile/issues)
