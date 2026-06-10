export async function initWatermarkUI() {
  const dropZone = document.getElementById('wm-drop-zone');
  const fileInput = document.getElementById('wm-file-input');
  const method = document.getElementById('wm-method');
  const threshold = document.getElementById('wm-threshold');
  const thresholdVal = document.getElementById('wm-threshold-val');
  const windowSize = document.getElementById('wm-window');
  const windowVal = document.getElementById('wm-window-val');
  const radius = document.getElementById('wm-radius');
  const radiusVal = document.getElementById('wm-radius-val');
  const preview = document.getElementById('wm-preview');
  const canvasBefore = document.getElementById('wm-canvas-before');
  const canvasAfter = document.getElementById('wm-canvas-after');
  const processBtn = document.getElementById('wm-process-btn');
  const downloadBtn = document.getElementById('wm-download-btn');

  let currentFile = null;
  let currentResultData = null;
  let originalImageData = null;
  let imageWidth = 0;
  let imageHeight = 0;

  [threshold, windowSize, radius].forEach(slider => {
    slider.addEventListener('input', () => {
      const val = document.getElementById(`wm-${slider.id.split('-')[1]}-val`);
      if (val) val.textContent = slider.value;
    });
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  ['dragenter', 'dragover'].forEach(ev => {
    dropZone.addEventListener(ev, () => dropZone.classList.add('dragover'));
  });
  ['dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover'));
  });
  dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length > 0) loadImage(files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) loadImage(e.target.files[0]);
  });

  function loadImage(file) {
    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        imageWidth = img.width;
        imageHeight = img.height;
        canvasBefore.width = img.width;
        canvasBefore.height = img.height;
        canvasAfter.width = img.width;
        canvasAfter.height = img.height;
        const ctx = canvasBefore.getContext('2d');
        ctx.drawImage(img, 0, 0);
        originalImageData = ctx.getImageData(0, 0, img.width, img.height);
        canvasAfter.getContext('2d').drawImage(img, 0, 0);
        preview.style.display = 'block';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  processBtn.addEventListener('click', async () => {
    if (!currentFile || !originalImageData) return;
    processBtn.textContent = 'Processing...';
    processBtn.disabled = true;

    try {
      const arrayBuffer = await currentFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const ext = currentFile.name.split('.').pop().toLowerCase();

      const thresh = parseInt(threshold.value);
      const win = parseInt(windowSize.value);
      const rad = parseInt(radius.value);
      const meth = method.value;

      const { remove_watermark } = await import('../pkg/imgstrip.js');

      const result = remove_watermark(bytes, ext, meth, thresh, win, rad);
      const resultBytes = result.data;

      currentResultData = resultBytes;

      const blob = new Blob([resultBytes], { type: currentFile.type || 'image/png' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const ctx = canvasAfter.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      console.error('Watermark removal error:', err);
      alert('Failed to process image. The file may be unsupported or too large.');
    }

    processBtn.textContent = 'Remove Watermark';
    processBtn.disabled = false;
  });

  downloadBtn.addEventListener('click', () => {
    if (!currentResultData) return;
    const blob = new Blob([currentResultData], { type: currentFile?.type || 'image/png' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleaned_${currentFile?.name || 'image.png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}
