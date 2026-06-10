import init, { strip_image_metadata, strip_video_metadata } from './pkg/imgstrip.js';

let wasmReady = false;

async function setup() {
  try {
    await init();
    wasmReady = true;
    console.log("WASM Initialized");
  } catch (err) {
    console.error("Failed to initialize WASM:", err);
  }
}

setup();

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
    alert("Please wait for the WASM module to load.");
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

function isVideoFile(ext) {
  return VIDEO_EXTS.includes(ext);
}

async function processFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  const extMatch = file.name.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  
  let result;
  try {
    if (isVideoFile(ext)) {
      result = strip_video_metadata(bytes, ext);
    } else {
      result = strip_image_metadata(bytes, ext);
    }
  } catch (err) {
    console.error("Error processing file", file.name, err);
    addFileToList(file.name, file.size, false, null);
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
  
  addFileToList(file.name, file.size, wasModified, downloadUrl);
}

function addFileToList(name, size, wasModified, downloadUrl) {
  const item = document.createElement('div');
  item.className = 'file-item';
  
  const extMatch = name.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const isVideo = VIDEO_EXTS.includes(ext);
  
  const formattedSize = (size / 1024).toFixed(1) + ' KB';
  const statusClass = wasModified ? 'success' : '';
  const badgeHtml = isVideo ? `<span class="file-type-badge">video</span>` : '';
  
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
