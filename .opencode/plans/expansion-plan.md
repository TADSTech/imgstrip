# Expansion Plan: Text Humanizer + Watermark Remover

## Overview

Add two new tools to Imgstrip in a tabbed single-page app layout, keeping the same privacy-first client-side philosophy. All processing stays in-browser — zero server calls.

---

## 1. App Architecture (Tabbed Layout)

### Current
Single page: strip images/videos → download cleaned files

### New Layout
```
┌─────────────────────────────────────────────┐
│  ImgStrip   [Strip]  [Humanize]  [Watermark] │
│─────────────────────────────────────────────│
│                                               │
│  (active tab content renders here)            │
│                                               │
└─────────────────────────────────────────────┘
```

Three tabs, shown/hidden via JS. No routing library — just `display: none/block` on section elements.

---

## 2. Text Humanizer — Pure JavaScript

Rule-based transformation pipeline. No LLM, no API, no WASM. Each rule is a pure function: `text → text`.

### Pipeline (staged)

```
Input text
  ↓
1. Phrase replacement (~50+ mappings)
     "it is important to note that" → ""
     "in order to" → "to"
     "serves as / stands as" → "is / are"
     "showcases / highlights / underscores" → "shows"
     "a testament to" → ""
     "pivotal / crucial / vital" → "important"
     "evolving landscape" → "changes"
     "fostering" → "building"
     "nestled" → "located"
     "in the heart of" → "in"
     "boasts" → "has"
     "renowned" → "well-known"
     "delve into" → "explore"
     "navigate the complexities" → "handle"
  ↓
2. Grammar fixes
     Passive → active voice detection
     Copula avoidance → plain is/are
     -ing tail phrases → separate or remove
  ↓
3. Style fixes
     Em dash → comma/parentheses
     Rule-of-three → merge or drop third
     Hyphenated pairs → unhyphenate
     Curly quotes → straight quotes
     Title headings → sentence case
  ↓
4. Cleanup
     Remove filler ("actually", "additionally", "furthermore")
     Remove hedging ("potentially", "it could be argued")
     Remove signposting ("Let's dive in", "Here's what...")
     Remove generic conclusions ("The future looks bright")
     Remove chatbot artifacts ("I hope this helps!")
  ↓
5. Naturalization
     Add contractions (it is → it's, they are → they're)
     Vary sentence openings
     Break long sentences (after 30+ words)
Output text
```

### Aggressiveness levels

| Level | Applies |
|---|---|
| Mild | Phrase replacement + cleanup |
| Moderate (default) | Above + grammar + style |
| Aggressive | All + heavy restructuring + contractions |

### Output
- Preview in a read-only textarea
- Copy to clipboard button
- Download as `.txt` file

### Files
- `js/humanizer/rules.js` — phrase dictionary + regex rules (data)
- `js/humanizer/pipeline.js` — rule engine, pipeline orchestrator
- `js/humanizer/ui.js` — tab UI handlers

### Dependencies
Zero — pure text processing.

---

## 3. Watermark Remover — Rust WASM

Two approaches, user toggles between them or uses "Auto."

### Approach A: Spatial Inpainting (primary)

For semi-transparent text/logo watermarks (most common type).

**Algorithm:**
```
1. Convert image to RGBA8 buffer
2. For each pixel, compute local mean brightness in a window
3. If pixel brightness > local_mean + threshold, mark as watermark
4. Refine mask: morphological close (dilate → erode)
5. Inpaint: for each masked pixel, weighted average of nearest
   unmasked pixels along 4 directions (N, S, E, W)
6. Write result
```

**Controls exposed:**
- Threshold slider (10-100, default 40)
- Window size (3-21, default 7)
- Inpaint radius (1-20, default 5)

### Approach B: FFT-based (for repeating/patterned watermarks)

For watermarks with periodic structure (e.g., repeating logo patterns).

**Algorithm:**
```
1. Pad image to next power of 2
2. Apply 2D FFT (custom radix-2, no external crate)
3. Find magnitude peaks in frequency domain
4. Apply notch filter (zero peak + neighborhood radius)
5. Inverse FFT
6. Crop back to original size
```

**Controls:**
- Notch radius (1-20, default 3)
- Peak detection sensitivity

### FFT Implementation

Custom radix-2 Cooley-Tukey FFT in Rust — avoids adding a crate dependency.

```
fn fft_1d(data: &mut [Complex<f64>]) {
    // Bit-reversal permutation
    // Butterfly loops (log2 N stages)
}

fn fft_2d(buf: &mut [Complex<f64>], w: usize, h: usize) {
    // FFT each row, transpose, FFT each row again
}

// Same for inverse FFT (conjugate + forward + scale)
```

~80 lines of Rust. Only works for power-of-2 sizes, but images are padded automatically.

### UI Preview
- Before/after split view (canvas side-by-side)
- Download cleaned image

### Files
- `src/watermark/mod.rs` — module root, dispatch
- `src/watermark/spatial.rs` — spatial inpainting
- `src/watermark/fft.rs` — custom radix-2 FFT + notch filter
- `src/lib.rs` — add `remove_watermark()` WASM export
- `js/watermark.js` — UI, canvas preview, download

### New Rust Dependencies
- None for spatial approach
- None for FFT (custom implementation)
- The `image` crate (already present) handles I/O

---

## 4. Tab Navigation

### HTML structure
```html
<nav class="tabs">
  <button class="tab-btn active" data-tab="strip">Strip</button>
  <button class="tab-btn" data-tab="humanize">Humanize</button>
  <button class="tab-btn" data-tab="watermark">Watermark</button>
</nav>

<section id="tab-strip" class="tab-content active">
  <!-- existing strip content -->
</section>
<section id="tab-humanize" class="tab-content">
  <!-- humanizer UI -->
</section>
<section id="tab-watermark" class="tab-content">
  <!-- watermark UI -->
</section>
```

### JS behavior
```js
// Click tab → hide all sections, show target
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});
```

---

## 5. File Changes Summary

| File | Action | Description |
|---|---|---|
| `index.html` | Modify | Add tab nav, humanize section, watermark section |
| `style.css` | Modify | Tab styles, textarea, slider, before/after preview |
| `app.js` | Modify | Tab switching, init WASM watermark bindings |
| `js/humanizer/rules.js` | **New** | Phrase dictionary + regex rules |
| `js/humanizer/pipeline.js` | **New** | Pipeline orchestrator |
| `js/humanizer/ui.js` | **New** | Humanizer tab UI |
| `js/watermark.js` | **New** | Watermark tab UI + WASM calls |
| `src/lib.rs` | Modify | Add `remove_watermark()` |
| `src/watermark/mod.rs` | **New** | Module root |
| `src/watermark/spatial.rs` | **New** | Spatial inpainting |
| `src/watermark/fft.rs` | **New** | Custom FFT + notch filter |
| `src/main.rs` | Modify | Add watermark CLI (optional) |

---

## 6. Implementation Order

| Phase | What | Why this order |
|---|---|---|
| 1 | Tab layout (HTML/CSS/JS shell) | Foundation — everything else goes inside tabs |
| 2 | Text Humanizer (pure JS) | Quick win, no WASM rebuild needed |
| 3 | Watermark spatial inpainting (Rust) | Core watermark feature, no new deps |
| 4 | Watermark FFT (Rust) | Secondary approach, custom FFT impl |
| 5 | UI polish | Before/after preview, responsive, tooltips |
| 6 | Build + deploy | wasm-pack, vite build, Vercel deploy |
