import init, { strip_image_metadata, strip_video_metadata, strip_audio_metadata } from './pkg/nanlabel.js';
import { humanize } from './js/humanizer.js';
import { initWatermarkUI } from './js/watermark.js';

let wasmReady = false;
let ffmpegInstance = null;
let ffmpegLoading = false;

async function setup() {
  try {
    await init();
    wasmReady = true;
    console.log("NanLabel WASM Initialized");
  } catch (err) {
    console.error("Failed to initialize WASM:", err);
  }
}

setup();

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tab = document.getElementById(`tab-${btn.dataset.tab}`);
    if (tab) tab.classList.add('active');
  });
});

// ===== Video method hint =====
const videoMethodSelect = document.getElementById('video-method');
const videoMethodHint = document.getElementById('video-method-hint');

const HINTS = {
  'metadata-only': 'Metadata Only: removes embedded tags without re-encoding. Instant and lossless.',
  'ffmpeg-deep': 'FFmpeg Deep Clean: uses ffmpeg.wasm to run -map_metadata -1 -map_chapters -1, stripping C2PA manifests with zero quality loss.',
  'synthid': 'SynthID Perturbation: applies sub-pixel frequency shifts across every video frame to disrupt invisible AI watermarks. Slower but thorough.',
};

videoMethodSelect.addEventListener('change', () => {
  videoMethodHint.textContent = HINTS[videoMethodSelect.value] || '';
});

// ===== Strip Tab =====
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultsSection = document.getElementById('results');
const filesList = document.getElementById('files-list');
const downloadAllBtn = document.getElementById('download-all-btn');

let processedFiles = [];

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.remove('dragover');
  }, false);
});

dropZone.addEventListener('drop', handleDrop, false);
fileInput.addEventListener('change', handleFiles, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles({ target: { files } });
}

async function handleFiles(e) {
  if (!wasmReady) {
    showNotification("Please wait for the WASM module to load.");
    return;
  }

  const files = [...e.target.files];
  if (files.length === 0) return;

  resultsSection.style.display = 'block';

  for (const file of files) {
    await processFile(file);
  }
}

const VIDEO_EXTS = ['mp4', 'mov', 'm4v', '3gp', 'webm', 'mkv', 'avi'];
const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'wave', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'm4b', 'm4p'];

function isVideoFile(ext) {
  return VIDEO_EXTS.includes(ext);
}

function isAudioFile(ext) {
  return AUDIO_EXTS.includes(ext);
}

function getMediaType(ext) {
  if (isVideoFile(ext)) return 'video';
  if (isAudioFile(ext)) return 'audio';
  return 'image';
}

// ===== FFmpeg.wasm lazy loader =====
async function loadFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) {
    // Wait for existing load
    while (ffmpegLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    return ffmpegInstance;
  }
  ffmpegLoading = true;
  const statusEl = document.getElementById('ffmpeg-status');
  const statusText = document.getElementById('ffmpeg-status-text');
  const progressFill = document.getElementById('ffmpeg-progress');
  statusEl.style.display = 'block';
  statusText.textContent = 'Loading FFmpeg engine (~30MB, one-time download)...';

  try {
    const { FFmpeg } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/+esm');
    const { fetchFile } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm');
    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.round(progress * 100);
      progressFill.style.width = `${pct}%`;
      statusText.textContent = `Processing... ${pct}%`;
    });

    ffmpeg.on('log', ({ message }) => {
      console.log('[ffmpeg]', message);
    });

    await ffmpeg.load({
      coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    });

    ffmpegInstance = { ffmpeg, fetchFile };
    statusText.textContent = 'FFmpeg ready.';
    setTimeout(() => { statusEl.style.display = 'none'; }, 1500);
  } catch (err) {
    console.error('Failed to load FFmpeg:', err);
    statusText.textContent = 'FFmpeg failed to load. Falling back to metadata-only mode.';
  }
  ffmpegLoading = false;
  return ffmpegInstance;
}

// ===== FFmpeg deep clean =====
async function ffmpegDeepClean(fileBytes, fileName) {
  const ff = await loadFFmpeg();
  if (!ff) return null;
  const { ffmpeg, fetchFile } = ff;

  const inputName = 'input_' + fileName;
  const outputName = 'output_' + fileName;

  await ffmpeg.writeFile(inputName, await fetchFile(new Blob([fileBytes])));
  await ffmpeg.exec([
    '-i', inputName,
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-c:v', 'copy',
    '-c:a', 'copy',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);
  return new Uint8Array(data);
}

// ===== SynthID Perturbation (Canvas-based) =====
async function perturbSynthID(fileBytes, fileName) {
  // Step 1: Use ffmpeg to extract frames, perturb each, re-encode
  const ff = await loadFFmpeg();
  if (!ff) return null;
  const { ffmpeg, fetchFile } = ff;

  const statusText = document.getElementById('ffmpeg-status-text');
  const statusEl = document.getElementById('ffmpeg-status');
  statusEl.style.display = 'block';

  const inputName = 'input_' + fileName;
  const outputName = 'output_synth_' + fileName;

  await ffmpeg.writeFile(inputName, await fetchFile(new Blob([fileBytes])));

  // Apply sub-pixel perturbation via ffmpeg video filter
  // This applies a very subtle noise + slight color shift that disrupts SynthID patterns
  // while being visually imperceptible
  statusText.textContent = 'Applying SynthID perturbation (this may take a while)...';

  await ffmpeg.exec([
    '-i', inputName,
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-vf', 'noise=alls=2:allf=t+u,hue=h=0.3,unsharp=3:3:0.3:3:3:0.0',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-c:a', 'copy',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  statusText.textContent = 'SynthID perturbation complete.';
  setTimeout(() => { statusEl.style.display = 'none'; }, 2000);

  return new Uint8Array(data);
}

async function processFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const extMatch = file.name.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const mediaType = getMediaType(ext);

  let result;
  try {
    if (mediaType === 'video') {
      const method = videoMethodSelect.value;

      if (method === 'ffmpeg-deep') {
        const cleanedBytes = await ffmpegDeepClean(bytes, file.name);
        if (cleanedBytes) {
          result = { data: cleanedBytes, modified: true };
        } else {
          // Fallback to WASM metadata-only
          const r = strip_video_metadata(bytes, ext);
          result = { data: r.data, modified: r.modified };
        }
      } else if (method === 'synthid') {
        const perturbedBytes = await perturbSynthID(bytes, file.name);
        if (perturbedBytes) {
          result = { data: perturbedBytes, modified: true };
        } else {
          const r = strip_video_metadata(bytes, ext);
          result = { data: r.data, modified: r.modified };
        }
      } else {
        const r = strip_video_metadata(bytes, ext);
        result = { data: r.data, modified: r.modified };
      }
    } else if (mediaType === 'audio') {
      const r = strip_audio_metadata(bytes, ext);
      result = { data: r.data, modified: r.modified };
    } else {
      const r = strip_image_metadata(bytes, ext);
      result = { data: r.data, modified: r.modified };
    }
  } catch (err) {
    console.error("Error processing file", file.name, err);
    addFileToList(file.name, file.size, false, null, mediaType);
    return;
  }

  const strippedBytes = result.data;
  const wasModified = result.modified;

  let downloadUrl = null;
  if (wasModified) {
    const blob = new Blob([strippedBytes], { type: file.type || 'application/octet-stream' });
    downloadUrl = URL.createObjectURL(blob);
    processedFiles.push({ name: file.name, url: downloadUrl });
  } else {
    const blob = new Blob([bytes], { type: file.type || 'application/octet-stream' });
    downloadUrl = URL.createObjectURL(blob);
  }

  addFileToList(file.name, file.size, wasModified, downloadUrl, mediaType);
}

function addFileToList(name, size, wasModified, downloadUrl, mediaType) {
  const item = document.createElement('div');
  item.className = 'file-item';

  const formattedSize = size > 1048576
    ? (size / 1048576).toFixed(1) + ' MB'
    : (size / 1024).toFixed(1) + ' KB';
  const statusClass = wasModified ? 'success' : '';
  const badgeHtml = `<span class="file-type-badge">${mediaType}</span>`;

  item.innerHTML = `
    <div class="file-info">
      <div class="file-status ${statusClass}"></div>
      <div>
        <div class="file-name">${name}${badgeHtml}</div>
        <div class="file-size">${formattedSize} ${wasModified ? '(Cleaned)' : '(No metadata found/Unsupported)'}</div>
      </div>
    </div>
    <div class="file-actions">
      ${downloadUrl ? `<a href="${downloadUrl}" download="clean_${name}" class="btn-small">Download</a>` : '<span class="file-size">Error</span>'}
    </div>
  `;

  filesList.appendChild(item);
}

downloadAllBtn.addEventListener('click', () => {
  processedFiles.forEach(file => {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = `clean_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
});

// ===== Simple notification (replaces alert) =====
function showNotification(message) {
  const existing = document.querySelector('.nanlabel-notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'nanlabel-notification';
  el.textContent = message;
  el.style.cssText = `
    position: fixed; top: 1rem; right: 1rem; padding: 0.8rem 1.5rem;
    background: #000; color: #fff; font-family: Inter, sans-serif;
    font-size: 0.85rem; z-index: 9999; border: 1px solid #fff;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ===== Humanize Tab =====
const humanizeInput = document.getElementById('humanize-input');
const humanizeOutput = document.getElementById('humanize-output');
const humanizeBtn = document.getElementById('humanize-btn');
const humanizeCopyBtn = document.getElementById('humanize-copy-btn');
const humanizeDownloadBtn = document.getElementById('humanize-download-btn');
const humanizePasteBtn = document.getElementById('humanize-paste-btn');

humanizeBtn.addEventListener('click', () => {
  const level = document.querySelector('input[name="aggressiveness"]:checked')?.value || 'moderate';
  const result = humanize(humanizeInput.value, level);
  humanizeOutput.value = result;
});

humanizePasteBtn.addEventListener('click', async () => {
  try {
    humanizeInput.value = await navigator.clipboard.readText();
  } catch {
    showNotification('Could not read clipboard. Please paste manually (Ctrl+V).');
  }
});

humanizeCopyBtn.addEventListener('click', async () => {
  if (!humanizeOutput.value) return;
  try {
    await navigator.clipboard.writeText(humanizeOutput.value);
    humanizeCopyBtn.textContent = 'Copied!';
    setTimeout(() => { humanizeCopyBtn.textContent = 'Copy'; }, 1500);
  } catch {
    showNotification('Could not copy to clipboard.');
  }
});

humanizeDownloadBtn.addEventListener('click', () => {
  if (!humanizeOutput.value) return;
  const blob = new Blob([humanizeOutput.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'humanized.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ===== Watermark Tab =====
initWatermarkUI();
