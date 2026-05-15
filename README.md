# 🖼️ ImgStrip

**Secure, Fast, and Private Image Metadata Removal.**

ImgStrip is a Free and Open Source (FOSS) web application designed to protect your privacy by stripping tracking metadata (EXIF, XMP, C2PA, etc.) from images directly in your browser.

[![FOSS](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![WASM](https://img.shields.io/badge/Powered%20by-WebAssembly-6366f1.svg)](https://webassembly.org/)

## ✨ Features

- **100% Client-Side**: Your images never leave your computer. Processing happens entirely in your browser via WebAssembly (WASM).
- **Deep Cleaning**: Removes EXIF, XMP, ICC profiles, and even modern C2PA/Adobe Content Credentials.
- **High Performance**: Built with Rust for lightning-fast processing of multiple images.
- **Modern UI**: Clean, super-minimalist design with drag-and-drop support.
- **Privacy First**: Zero trackers, zero cookies, zero server logs.

## 🚀 How it Works

ImgStrip uses a specialized Rust engine compiled to WebAssembly. When you drop an image:
1. The file is read into memory as a byte array.
2. The WASM engine parses the image format (JPEG, PNG, WebP, etc.).
3. It identifies and removes ancillary chunks and metadata segments.
4. For unsupported formats or complex structures, it performs a secure re-encode to ensure a clean output.
5. A download link is generated for the "cleaned" version.

## 🛠️ Tech Stack

- **Core Logic**: Rust
- **Web Interface**: Vanilla JS + CSS (Vite)
- **Compilation**: `wasm-pack`
- **Design**: Super Minimalist UI (B&W)

## 📦 Installation & Local Development

### Prerequisites
- [Rust](https://www.rust-lang.org/)
- [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/imgstrip.git
   cd imgstrip
   ```

2. **Build the WASM module:**
   ```bash
   wasm-pack build --target web
   ```

3. **Install JS dependencies:**
   ```bash
   pnpm install
   ```

4. **Run development server:**
   ```bash
   pnpm dev
   ```

5. **Build for production:**
   ```bash
   pnpm build
   ```

## 🛡️ Privacy Policy

ImgStrip is built on the principle of data sovereignty. No image data is ever uploaded to a server. The "No Dedicated Server" architecture ensures that even if the host is compromised, your private image data remains on your local machine.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Built with ❤️ for a more private web.*
