# NanLabel

**Strip metadata from images, audio, and video. 100% in your browser.**

NanLabel is a Free and Open Source (FOSS) privacy tool that removes tracking metadata, AI content credentials (C2PA), invisible AI watermarks (SynthID), and all embedded identifiers from your media files — entirely client-side using WebAssembly. No servers. No uploads. No cellular data wasted.

[![FOSS](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![WASM](https://img.shields.io/badge/Powered%20by-WebAssembly-000000.svg)](https://webassembly.org/)

---

## Features

- **100% Offline**: All processing runs in your browser via WASM. Nothing leaves your device.
- **Image Stripping**: EXIF, XMP, ICC profiles, C2PA manifests, ancillary PNG chunks.
- **Audio Stripping**: ID3v1, ID3v2, APEv2, Vorbis comments, FLAC metadata blocks, M4A/AAC atoms, WAV INFO chunks. Removes album art, lyrics, encoder info, recording software tags.
- **Video Stripping (3 modes)**:
  - **Metadata Only** — instant, lossless removal of embedded tags (WASM).
  - **FFmpeg Deep Clean** — runs `ffmpeg -map_metadata -1 -map_chapters -1 -c:v copy -c:a copy` via ffmpeg.wasm for C2PA manifest removal with zero quality loss.
  - **SynthID Perturbation** — applies sub-pixel frequency perturbation across video frames to disrupt invisible AI watermarks embedded in pixel data.
- **Text Humanizer**: Rewrites AI-generated prose to sound natural.
- **Watermark Remover**: Spatial inpainting and FFT frequency filtering for semi-transparent watermarks.

## Supported Formats

| Type | Formats |
|------|---------|
| Image | JPG, PNG, WEBP, GIF, BMP, TIFF, AVIF, ICO, TGA, QOI |
| Audio | MP3, FLAC, WAV, OGG, Opus, M4A, AAC |
| Video | MP4, MOV, M4V, 3GP, WebM, MKV, AVI |

## How It Works

### Images
The Rust/WASM engine parses the binary format directly (JPEG APP segments, PNG ancillary chunks) and surgically removes metadata while preserving image data. For formats without native parsing, it re-encodes through the `image` crate.

### Audio
Each audio format has a dedicated parser:
- **MP3**: Strips ID3v2 headers (at file start) and ID3v1 tags (last 128 bytes), plus APEv2 tags.
- **FLAC**: Preserves only STREAMINFO and SEEKTABLE blocks; strips VORBIS_COMMENT, PICTURE, APPLICATION, and CUESHEET.
- **OGG/Opus**: Replaces the Vorbis comment packet with an empty one while preserving page structure.
- **WAV**: Removes LIST/INFO and JUNK chunks from RIFF container.
- **M4A/AAC**: Strips `udta`, `meta`, `ilst`, and `uuid` boxes from ISO BMFF container.

### Video
Three processing modes:

1. **Metadata Only (WASM)**: Parses the container format (ISO BMFF for MP4/MOV, EBML for MKV/WebM, RIFF for AVI) and surgically removes metadata boxes/elements. Zero quality loss, instant.

2. **FFmpeg Deep Clean (ffmpeg.wasm)**: Loads a full FFmpeg engine in the browser and runs:
   ```
   ffmpeg -i input.mp4 -map_metadata -1 -map_chapters -1 -c:v copy -c:a copy output.mp4
   ```
   This strips all global metadata, software tags, and C2PA manifests while stream-copying (no re-encoding).

3. **SynthID Perturbation (ffmpeg.wasm)**: For invisible frame-level AI watermarks (like Google SynthID), applies sub-pixel noise and frequency perturbation across every frame to disrupt the mathematical patterns detected by AI scanners, while preserving visual quality.

## Tech Stack

- **Core Logic**: Rust → WebAssembly
- **Video Processing**: ffmpeg.wasm (loaded on-demand from CDN)
- **Web Interface**: Vanilla JS + CSS (Vite)
- **Design**: Minimalist B&W

## Installation & Local Development

### Prerequisites
- [Rust](https://www.rust-lang.org/)
- [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/nanlabel.git
   cd nanlabel
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

## Privacy Policy

NanLabel processes all files locally in your browser. No file data is ever uploaded to any server. The FFmpeg deep clean mode loads the ffmpeg.wasm engine from a CDN (one-time download), but your actual media files never leave your machine.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Strip everything. Trust nothing. Keep your media clean.*
