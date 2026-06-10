# Plan: Add Video Metadata Stripping to ImgStrip

## Overview

Extend ImgStrip to accept video files and strip metadata from common video container formats, using the same client-side WASM architecture as the existing image processing. No re-encoding — container-level parsing only, preserving quality.

---

## Approach: Container-Level Parsing (Zero Re-encode)

Same philosophy as current JPEG/PNG stripping: parse the container format, identify metadata structures, copy everything else verbatim. No decode/encode cycle — bit-perfect for non-metadata content.

| Format | Container | Strategy |
|---|---|---|
| MP4, MOV, M4V, 3GP | ISO Base Media File Format (ISOBMFF) | Parse box tree, filter out metadata boxes |
| WebM, MKV | Matroska (EBML) | Parse EBML elements, strip metadata tags |
| AVI | RIFF | Parse RIFF chunks, strip metadata INFO chunks |

---

## Format Details: What to Strip

### MP4/MOV/M4V/3GP — ISO BMFF

Boxes to **strip** (metadata):
| Box Path | Content | 
|---|---|
| `moov > udta` | User data: copyright, iTunes metadata, XMP |
| `moov > udta > meta` | Metadata container |
| `moov > udta > XMP_` | XMP data |
| `moov > udta > CPXM` | C2PA / Adobe Content Credentials |
| `moov > udta > ©xyz` | iTunes-style metadata tags |
| `moov > udta > uuid` | Extended metadata (may contain EXIF/XMP) |
| `moov > meta` | Top-level metadata (also at `moov` level) |
| Top-level `uuid` | User extensions, may carry metadata |
| Top-level `meta` | Top-level metadata |

Boxes to **keep** (essential):
| Box Path | Content |
|---|---|
| `ftyp` | File type |
| `moov > mvhd` | Movie header |
| `moov > trak` (and children) | Track data (video/audio) |
| `moov > trak > tkhd` | Track header |
| `moov > trak > mdia` (and children) | Media data |
| `mdat` | Media data (video/audio samples) |
| `moof`, `traf` | Fragment info (for fragmented MP4) |
| `free`, `skip` | Padding (can keep or skip) |

### WebM/MKV — Matroska/EBML

EBML elements to **strip**:
| Element ID | Name | Content |
|---|---|---|
| `0x1254C367` | Tags | Metadata tags |
| `0x1250` | SeekHead (can strip) | Index of elements |
| `0x4D80` | ChapterDisplay | Chapter names |
| `0x6D80` | Attachment | Attached files/meta |

Elements to **keep**:
| Element ID | Name |
|---|---|
| `0x1A45DFA3` | EBML header |
| `0x18538067` | Segment |
| `0x1654AE6B` | Tracks |
| `0x1F43B675` | Cluster |
| `0x1C53BB6B` | Cues |

### AVI — RIFF

Chunks to **strip**:
| Chunk ID | Content |
|---|---|
| `LIST` with type `INFO` | Metadata: author, copyright, etc. |
| `JUNK` | Padding |

Chunks to **keep**:
| Chunk ID | Content |
|---|---|
| `LIST` with type `hdrl` | Header |
| `LIST` with type `movi` | Movie data |
| `idx1` | Index |

---

## Implementation Plan

### Phase 1: Rust Core — ISO BMFF Parser (MP4/MOV)

**File:** `src/video/iso_bmff.rs`

```
BoxHeader {
    size: u32,         // 0 = extends to EOF, 1 = uses large_size
    box_type: [u8; 4],
    large_size: u64,   // Only if size == 1
}

Functions:
- fn parse_boxes(data: &[u8]) -> Vec<Box>
- fn filter_metadata_boxes(input: &[u8]) -> Vec<u8>
  Recursively walks box tree.
  For each box:
    - If known metadata box → skip
    - If container box → recurse into children, adjust parent size
    - Otherwise → copy verbatim
```

**Metadata box detection:**
- Known metadata box types: `udta`, `meta`, `XMP_`, `CPXM`, `uuid`
- Container box types (recurse into): `moov`, `trak`, `mdia`, `minf`, `dinf`, `stbl`, `edts`, `udta`, `meta`

Key challenge: When removing child boxes from a container, the parent box's `size` field must be updated. This is straightforward — we know the total output size of all kept children + header size.

### Phase 2: Rust Core — Matroska/EBML Parser (WebM/MKV)

**File:** `src/video/ebml.rs`

```
EBML uses Variable-Length Integers (VINT) for element IDs and sizes.
VINT encoding: first byte has leading 1s indicating length, then a 0, then value bits.

Functions:
- fn read_vint(data: &[u8]) -> (u64, usize)  // value, bytes consumed
- fn parse_ebml_elements(data: &[u8]) -> Vec<EbmlElement>
- fn filter_metadata_elements(input: &[u8]) -> Vec<u8>
```

Elements to strip:
- Tags (`0x1254C367`) — metadata tags
- SeekHead (`0x114D9B74`) — seek index (optional)
- Info metadata portions (selectively strip sub-elements)

### Phase 3: Rust Core — RIFF Parser (AVI)

**File:** `src/video/riff.rs`

```
RiffChunk {
    id: [u8; 4],
    size: u32,
    data: Vec<u8>,
}

Functions:
- fn parse_riff(data: &[u8]) -> Vec<RiffChunk>
- fn filter_metadata_chunks(input: &[u8]) -> Vec<u8>
```

Strip `LIST` chunks with form type `INFO`, and `JUNK` chunks.

### Phase 4: Main WASM Function

**File:** `src/lib.rs` — Add:

```rust
#[wasm_bindgen]
pub fn strip_video_metadata(input: &[u8], ext: &str) -> StripResult
```

Supported extensions:
- `mp4`, `mov`, `m4v`, `3gp` → ISO BMFF
- `webm`, `mkv` → Matroska/EBML
- `avi` → RIFF

Returns `modified: true` with stripped bytes, or `modified: false` if format unsupported or parsing failed.

### Phase 5: Module Organization

**New files in `src/`:**
```
src/
  lib.rs              # Add strip_video_metadata() + re-export
  main.rs             # Update for video support
  video/
    mod.rs            # Video module root
    iso_bmff.rs       # MP4/MOV/M4V box parser
    ebml.rs           # WebM/MKV EBML parser
    riff.rs           # AVI RIFF parser
```

**No new Cargo dependencies** — all parsing is custom byte-level code, maximizing WASM compatibility and minimizing binary size.

### Phase 6: Frontend (`app.js`)

- Add function to detect video file types
- Call `strip_video_metadata()` for video files instead of `strip_image_metadata()`
- Update file type display:
  - Show video duration if available (via `<video>` element metadata)
  - Show "Cleaned" status with file size comparison
- Handle blob creation with correct MIME types:
  - MP4 → `video/mp4`
  - WebM → `video/webm`
  - MOV → `video/quicktime`
  - AVI → `video/x-msvideo`
  - MKV → `video/x-matroska`

### Phase 7: Frontend (`index.html`)

- Update `accept` attribute on file input: `accept="image/*,video/*"`
- Update drop zone text: "Drag & Drop Images or Videos"
- Update description: "or click to select files (JPG, PNG, WEBP, MP4, MOV, etc.)"
- Update page title and meta description to mention video

### Phase 8: Frontend (`style.css`)

- Minimal changes — video file items reuse same `.file-item` styling
- Maybe add a small video icon indicator (optional)

### Phase 9: CLI (`src/main.rs`)

- Add video extensions to `supported_exts`: `"mp4", "mov", "m4v", "3gp", "webm", "mkv", "avi"`
- Update `strip_metadata()` to detect video files and call video stripping logic
- Or create `strip_video_metadata()` parallel function
- Update TUI log messages to mention video support

### Phase 10: Production Build

- `wasm-pack build --target web --release`
- `pnpm build`
- Test video files of various formats

---

## Edge Cases & Considerations

| Issue | Handling |
|---|---|
| Fragmented MP4 (moof/traf) | Boxes remain untouched, just skip metadata boxes |
| Large files (>2GB) | ISOBMFF uses 64-bit sizes (size=1 + large_size) — handle via u64 |
| Corrupted files | Return `modified: false` with original bytes, log error |
| No metadata found | Return `modified: false`, original bytes unchanged |
| Variable-length EBML | Correctly parse VINT encoded sizes |
| RIFF size > 2GB | Use u32 as per spec (RIFF max is 4GB) |
| WASM memory limit | Files processed in memory with Vec<u8> — large files may hit WASM heap limit (~2GB theoretical, practical ~500MB) |

---

## File Size / WASM Impact

- Custom parsers add ~300-500 lines of Rust code total
- Zero new dependencies → no increase in WASM binary size beyond compiled code
- Current WASM binary: `imgstrip_bg-O71hXq6z.wasm` — addition estimated to add <50KB

---

## Future Enhancement Possibilities

- **FLV support**: Simple tag-based format, easy to add
- **OGV (Ogg/Theora)**: Ogg container format, more complex
- **MPEG-TS**: Transport stream format (broadcast)
- **Image track metadata in HEIF/AVIF**: Similar ISOBMFF parsing
- **Batch video processing with progress**: Show progress for large files
- **Video preview thumbnails**: Show frame grab after cleaning
