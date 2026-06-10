// src/index.js

const HTML_CONTENT = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Textless Poster Generator</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root { color-scheme: light; }
  body {
    background:
      radial-gradient(circle at top, rgba(99, 102, 241, 0.08), transparent 28%),
      linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  }
  .canvas-shell {
    position: relative;
    width: 500px;
    height: 750px;
    margin: 0 auto;
    overflow: hidden;
    border-radius: 18px;
    background: linear-gradient(180deg, #e5e7eb, #f3f4f6);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.65),
      0 18px 50px rgba(15, 23, 42, 0.14);
  }
  canvas, img.preview-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
  }
  .mini-preview {
    width: 100%;
    max-width: 220px;
    height: 330px;
  }
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 9999px;
    background: #4f46e5;
    box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.45);
    animation: pulse 1.4s infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.45); }
    70% { box-shadow: 0 0 0 12px rgba(79, 70, 229, 0); }
    100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    padding: .35rem .75rem;
    border-radius: 9999px;
    background: #eef2ff;
    color: #4338ca;
    font-size: .75rem;
    font-weight: 700;
  }
</style>
</head>
<body class="min-h-screen text-slate-900 p-6 md:p-8 font-sans">
  <div class="max-w-4xl mx-auto bg-white/90 backdrop-blur border border-slate-200 rounded-3xl shadow-xl p-6 md:p-8">
    <div class="text-center mb-7">
      <h1 class="text-3xl md:text-4xl font-black tracking-tight text-slate-900">Textless Poster Generator</h1>
      <p class="mt-2 text-slate-600">
        Browser-side text masking with multiple detectors, then Workers AI inpainting.
      </p>
    </div>

    <div class="flex flex-col items-center">
      <input
        type="file"
        id="upload"
        accept="image/*"
        class="mb-5 block w-full text-sm text-slate-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition"
      />

      <div class="canvas-shell">
        <canvas id="imgCanvas" width="500" height="750"></canvas>
      </div>

      <div class="w-full mt-5 grid gap-3 md:grid-cols-2">
        <button
          id="generateBtn"
          class="w-full px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-indigo-300 transition shadow-md shadow-indigo-200"
        >
          Generate Textless Poster
        </button>

        <button
          id="resetBtn"
          class="w-full px-6 py-3.5 bg-slate-100 text-slate-800 rounded-xl font-bold hover:bg-slate-200 transition border border-slate-200"
        >
          Reset
        </button>
      </div>

      <div id="loading" class="hidden mt-5 text-indigo-700 font-semibold flex items-center gap-3">
        <div class="status-dot"></div>
        <span id="loadingText">Detecting text regions...</span>
      </div>

      <div id="diagnostics" class="hidden mt-4 flex flex-wrap gap-2 justify-center"></div>

      <div id="errorMsg" class="hidden mt-4 text-red-600 font-semibold text-sm text-center max-w-2xl"></div>

      <div id="previewSection" class="hidden w-full mt-8">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="text-center">
            <p class="mb-2 text-sm font-semibold text-slate-600">Detected Text Mask</p>
            <canvas id="maskPreviewCanvas" width="500" height="750" class="mini-preview mx-auto"></canvas>
          </div>

          <div class="text-center">
            <p class="mb-2 text-sm font-semibold text-slate-600">Final Result</p>
            <img id="resultImg" class="preview-image mini-preview mx-auto" alt="Generated textless poster" />
          </div>
        </div>
      </div>
    </div>
  </div>

<script>
(() => {
  const W = 500;
  const H = 750;
  const INFER_W = 504;
  const INFER_H = 752;
  const PAD_X = 2;
  const PAD_Y = 1;

  const uploadEl = document.getElementById('upload');
  const generateBtn = document.getElementById('generateBtn');
  const resetBtn = document.getElementById('resetBtn');
  const loadingEl = document.getElementById('loading');
  const loadingTextEl = document.getElementById('loadingText');
  const errorMsgEl = document.getElementById('errorMsg');
  const previewSectionEl = document.getElementById('previewSection');
  const resultImgEl = document.getElementById('resultImg');
  const diagnosticsEl = document.getElementById('diagnostics');

  const imgCanvas = document.getElementById('imgCanvas');
  const imgCtx = imgCanvas.getContext('2d', { willReadFrequently: true });

  const maskPreviewCanvas = document.getElementById('maskPreviewCanvas');

  let currentFile = null;
  let isProcessing = false;
  let currentObjectUrl = null;

  function showError(message) {
    errorMsgEl.textContent = message;
    errorMsgEl.classList.remove('hidden');
  }

  function clearError() {
    errorMsgEl.textContent = '';
    errorMsgEl.classList.add('hidden');
  }

  function setLoading(state, text = 'Detecting text regions...') {
    loadingTextEl.textContent = text;
    loadingEl.classList.toggle('hidden', !state);
    generateBtn.disabled = state;
    uploadEl.disabled = state;
    resetBtn.disabled = state;
  }

  function revokeResultUrl() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function drawImageCover(ctx, img, width, height) {
    ctx.clearRect(0, 0, width, height);
    const scale = Math.max(width / img.width, height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (width - drawW) / 2;
    const y = (height - drawH) / 2;
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  function canvasToBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Unable to export canvas.'));
        resolve(blob);
      }, type, quality);
    });
  }

  function imageBlobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode image.'));
      };
      img.src = url;
    });
  }

  function getLuma(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function makeGray(imageData) {
    const { data, width, height } = imageData;
    const out = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      out[p] = getLuma(data[i], data[i + 1], data[i + 2]);
    }
    return out;
  }

  function boxBlur(src, width, height, radius) {
    const tmp = new Float32Array(width * height);
    const out = new Float32Array(width * height);
    const span = radius * 2 + 1;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = clamp(dx, 0, width - 1);
        sum += src[row + x];
      }
      for (let x = 0; x < width; x++) {
        tmp[row + x] = sum / span;
        const rm = clamp(x - radius, 0, width - 1);
        const ad = clamp(x + radius + 1, 0, width - 1);
        sum += src[row + ad] - src[row + rm];
      }
    }

    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const y = clamp(dy, 0, height - 1);
        sum += tmp[y * width + x];
      }
      for (let y = 0; y < height; y++) {
        out[y * width + x] = sum / span;
        const rm = clamp(y - radius, 0, height - 1);
        const ad = clamp(y + radius + 1, 0, height - 1);
        sum += tmp[ad * width + x] - tmp[rm * width + x];
      }
    }

    return out;
  }

  function sobelMagnitude(gray, width, height) {
    const out = new Float32Array(width * height);
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;
        const a = gray[idx - width - 1], b = gray[idx - width], c = gray[idx - width + 1];
        const d = gray[idx - 1], f = gray[idx + 1];
        const g = gray[idx + width - 1], h = gray[idx + width], i = gray[idx + width + 1];
        const gx = (-a) + (-2 * d) + (-g) + c + (2 * f) + i;
        const gy = (-a) + (-2 * b) + (-c) + g + (2 * h) + i;
        const m = Math.hypot(gx, gy);
        out[idx] = m;
        sum += m;
        sumSq += m * m;
        count++;
      }
    }

    const mean = sum / Math.max(1, count);
    const variance = Math.max(0, sumSq / Math.max(1, count) - mean * mean);
    return { map: out, mean, std: Math.sqrt(variance) };
  }

  function thresholdMap(map, width, height, threshold) {
    const out = new Uint8Array(width * height);
    for (let i = 0; i < map.length; i++) out[i] = map[i] >= threshold ? 1 : 0;
    return out;
  }

  function dilate(mask, width, height, passes = 1) {
    let cur = mask;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Uint8Array(width * height);
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          let on = 0;
          for (let dy = -1; dy <= 1 && !on; dy++) {
            const ny = y + dy;
            const nRow = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              if (cur[nRow + x + dx]) { on = 1; break; }
            }
          }
          next[row + x] = on;
        }
      }
      cur = next;
    }
    return cur;
  }

  function erode(mask, width, height, passes = 1) {
    let cur = mask;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Uint8Array(width * height);
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          let keep = 1;
          for (let dy = -1; dy <= 1 && keep; dy++) {
            const ny = y + dy;
            const nRow = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              if (!cur[nRow + x + dx]) { keep = 0; break; }
            }
          }
          next[row + x] = keep;
        }
      }
      cur = next;
    }
    return cur;
  }

  function close(mask, width, height, passes = 1) {
    return erode(dilate(mask, width, height, passes), width, height, passes);
  }

  function open(mask, width, height, passes = 1) {
    return dilate(erode(mask, width, height, passes), width, height, passes);
  }

  function extractComponents(binary, width, height) {
    const visited = new Uint8Array(width * height);
    const comps = [];
    const stack = [];

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const start = row + x;
        if (!binary[start] || visited[start]) continue;

        visited[start] = 1;
        stack.length = 0;
        stack.push(start);

        let area = 0, minX = x, minY = y, maxX = x, maxY = y;

        while (stack.length) {
          const idx = stack.pop();
          const px = idx % width;
          const py = (idx / width) | 0;
          area++;
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;

          for (let dy = -1; dy <= 1; dy++) {
            const ny = py + dy;
            if (ny < 0 || ny >= height) continue;
            const nRow = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx;
              if (nx < 0 || nx >= width) continue;
              const nIdx = nRow + nx;
              if (!binary[nIdx] || visited[nIdx]) continue;
              visited[nIdx] = 1;
              stack.push(nIdx);
            }
          }
        }

        comps.push({ area, minX, minY, maxX, maxY });
      }
    }

    return comps;
  }

  function fillComponentBoxes(comps, width, height, padX, padY) {
    const mask = new Uint8Array(width * height);
    for (const c of comps) {
      const minX = clamp(c.minX - padX, 0, width - 1);
      const minY = clamp(c.minY - padY, 0, height - 1);
      const maxX = clamp(c.maxX + padX, 0, width - 1);
      const maxY = clamp(c.maxY + padY, 0, height - 1);
      for (let y = minY; y <= maxY; y++) {
        const row = y * width;
        for (let x = minX; x <= maxX; x++) {
          mask[row + x] = 1;
        }
      }
    }
    return mask;
  }

  function sumMask(mask) {
    let c = 0;
    for (let i = 0; i < mask.length; i++) c += mask[i] ? 1 : 0;
    return c;
  }

  function drawMaskToCanvas(mask, width, height, canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < mask.length; i++) {
      const v = mask[i] ? 255 : 0;
      const p = i * 4;
      imageData.data[p] = v;
      imageData.data[p + 1] = v;
      imageData.data[p + 2] = v;
      imageData.data[p + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function maskBorderPenalty(mask, width, height) {
    let border = 0, total = 0;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (!mask[row + x]) continue;
        total++;
        if (x < 6 || x >= width - 6 || y < 6 || y >= height - 6) border++;
      }
    }
    return total ? border / total : 1;
  }

  function centroid(mask, width, height) {
    let sx = 0, sy = 0, count = 0;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (!mask[row + x]) continue;
        sx += x;
        sy += y;
        count++;
      }
    }
    if (!count) return { x: 0.5, y: 0.5, count: 0 };
    return { x: sx / count / width, y: sy / count / height, count };
  }

  function scoreMask(mask, width, height) {
    const total = sumMask(mask);
    const cover = total / (width * height);
    const c = centroid(mask, width, height);

    let bottom = 0, center = 0, upper = 0;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (!mask[row + x]) continue;
        if (y > height * 0.48) bottom++;
        if (x > width * 0.12 && x < width * 0.88) center++;
        if (y < height * 0.18) upper++;
      }
    }

    const border = maskBorderPenalty(mask, width, height);
    const components = extractComponents(mask, width, height);
    const medium = components.filter(comp => comp.area >= 20 && comp.area <= width * height * 0.03).length;
    const wide = components.filter(comp => (comp.maxX - comp.minX + 1) / Math.max(1, (comp.maxY - comp.minY + 1)) > 1.3).length;

    let s = 0;
    s += Math.max(0, 2.5 - Math.abs(cover - 0.055) * 25);
    s += (bottom / Math.max(1, total)) * 2.5;
    s += (center / Math.max(1, total)) * 1.2;
    s += medium * 0.35;
    s += wide * 0.25;
    s += c.y > 0.45 ? 0.8 : 0;
    s += c.y > 0.60 ? 0.8 : 0;
    s -= border * 2.0;
    s -= upper / Math.max(1, total) * 1.5;
    return s;
  }

  function buildMaskFromScoreMap(scoreMap, width, height, threshold, minAreaRatio = 0.00008) {
    const binary = thresholdMap(scoreMap, width, height, threshold);
    let mask = close(open(binary, width, height, 1), width, height, 1);

    const comps = extractComponents(mask, width, height);
    const keep = [];
    for (const c of comps) {
      const boxW = c.maxX - c.minX + 1;
      const boxH = c.maxY - c.minY + 1;
      const areaRatio = c.area / (width * height);
      const aspect = boxW / Math.max(1, boxH);
      if (areaRatio < minAreaRatio) continue;
      if (areaRatio > 0.16) continue;
      if (boxW < 4 || boxH < 3) continue;
      if (aspect < 0.08 && boxH > height * 0.12) continue;
      keep.push(c);
    }

    mask = fillComponentBoxes(keep, width, height, 5, 4);
    mask = close(mask, width, height, 1);
    return mask;
  }

  function detectorAContrast(gray, width, height) {
    const blur = boxBlur(gray, width, height, 8);
    const score = new Float32Array(width * height);
    let sum = 0, sumSq = 0;

    for (let i = 0; i < score.length; i++) {
      const c = Math.abs(gray[i] - blur[i]);
      const y = Math.floor(i / width) / height;
      const bandBoost = y > 0.52 ? 16 : y > 0.38 ? 8 : 0;
      const brightBoost = gray[i] > 135 ? (gray[i] - 135) * 0.18 : 0;
      score[i] = c * 1.15 + bandBoost + brightBoost;
      sum += score[i];
      sumSq += score[i] * score[i];
    }

    const mean = sum / score.length;
    const std = Math.sqrt(Math.max(0, (sumSq / score.length) - mean * mean));
    const thresh = mean + std * 1.35;
    return buildMaskFromScoreMap(score, width, height, thresh);
  }

  function detectorBSobel(gray, width, height) {
    const sob = sobelMagnitude(gray, width, height);
    const blursob = boxBlur(sob.map, width, height, 2);
    const thresh = sob.mean + sob.std * 1.1;
    return buildMaskFromScoreMap(blursob, width, height, thresh, 0.0001);
  }

  uploadEl.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentFile = file;
    clearError();
    previewSectionEl.classList.add('hidden');

    try {
      const img = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const resImg = new Image();
          resImg.onload = () => resolve(resImg);
          resImg.onerror = () => reject(new Error('Failed to render loaded asset image.'));
          resImg.src = ev.target.result;
        };
        reader.onerror = () => reject(new Error('File reading failed.'));
        reader.readAsDataURL(file);
      });

      drawImageCover(imgCtx, img, W, H);
    } catch (err) {
      showError(err.message);
    }
  });

  generateBtn.addEventListener('click', async () => {
    if (!currentFile || isProcessing) return;
    isProcessing = true;
    clearError();
    revokeResultUrl();
    diagnosticsEl.innerHTML = '';
    diagnosticsEl.classList.add('hidden');

    try {
      setLoading(true, 'Running structural analysis models...');
      const sourceData = imgCtx.getImageData(0, 0, W, H);
      const gray = makeGray(sourceData);

      const maskA = detectorAContrast(gray, W, H);
      const maskB = detectorBSobel(gray, W, H);

      const scoreA = scoreMask(maskA, W, H);
      const scoreB = scoreMask(maskB, W, H);

      diagnosticsEl.classList.remove('hidden');
      
      const itemA = document.createElement('span');
      itemA.className = 'badge';
      itemA.textContent = 'Engine A Score: ' + scoreA.toFixed(2);
      diagnosticsEl.appendChild(itemA);

      const itemB = document.createElement('span');
      itemB.className = 'badge';
      itemB.textContent = 'Engine B Score: ' + scoreB.toFixed(2);
      diagnosticsEl.appendChild(itemB);

      let chosenMask = scoreA >= scoreB ? maskA : maskB;
      if (sumMask(chosenMask) === 0) {
        chosenMask = maskA; 
      }

      drawMaskToCanvas(chosenMask, W, H, maskPreviewCanvas);

      setLoading(true, 'Compressing canvases for inference layout...');
      
      const inferCanvas = document.createElement('canvas');
      inferCanvas.width = INFER_W;
      inferCanvas.height = INFER_H;
      const inferCtx = inferCanvas.getContext('2d');
      inferCtx.fillStyle = '#000000';
      inferCtx.fillRect(0, 0, INFER_W, INFER_H);
      inferCtx.drawImage(imgCanvas, PAD_X, PAD_Y, W, H);
      const imageBlob = await canvasToBlob(inferCanvas, 'image/jpeg', 0.92);

      const inferMaskCanvas = document.createElement('canvas');
      inferMaskCanvas.width = INFER_W;
      inferMaskCanvas.height = INFER_H;
      const inferMaskCtx = inferMaskCanvas.getContext('2d');
      inferMaskCtx.fillStyle = '#000000';
      inferMaskCtx.fillRect(0, 0, INFER_W, INFER_H);
      inferMaskCtx.drawImage(maskPreviewCanvas, PAD_X, PAD_Y, W, H);
      const maskBlob = await canvasToBlob(inferMaskCanvas, 'image/png');

      setLoading(true, 'Transmitting context frames to Workers AI Inpainter...');

      const formData = new FormData();
      formData.append('image', imageBlob, 'source.jpg');
      formData.append('mask', maskBlob, 'mask.png');

      const response = await fetch('/api/inpainting', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const textErr = await response.text();
        throw new Error('Upstream Engine Failure (' + response.status + '): ' + textErr);
      }

      const responseBlob = await response.blob();
      const outputImg = await imageBlobToImage(responseBlob);

      const cleanCanvas = document.createElement('canvas');
      cleanCanvas.width = W;
      cleanCanvas.height = H;
      const cleanCtx = cleanCanvas.getContext('2d');
      cleanCtx.drawImage(outputImg, -PAD_X, -PAD_Y, INFER_W, INFER_H);

      const finalBlob = await canvasToBlob(cleanCanvas, 'image/jpeg', 0.95);
      currentObjectUrl = URL.createObjectURL(finalBlob);
      resultImgEl.src = currentObjectUrl;

      previewSectionEl.classList.remove('hidden');
    } catch (err) {
      showError(err.message);
    } finally {
      isProcessing = false;
      setLoading(false);
    }
  });

  resetBtn.addEventListener('click', () => {
    uploadEl.value = '';
    currentFile = null;
    clearError();
    revokeResultUrl();
    diagnosticsEl.innerHTML = '';
    diagnosticsEl.classList.add('hidden');
    previewSectionEl.classList.add('hidden');
    imgCtx.clearRect(0, 0, W, H);
  });
})();
</script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Serve UI Interface Dashboard
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML_CONTENT, {
        headers: { 'content-type': 'text/html;charset=UTF-8' },
      });
    }

    // 2. Multi-Part Binary Processing Endpoint
    if (url.pathname === '/api/inpainting' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        const maskFile = formData.get('mask');

        if (!imageFile || !maskFile) {
          return new Response('Missing payload targets (image or mask).', { status: 400 });
        }

        const imageBuffer = await imageFile.arrayBuffer();
        const maskBuffer = await maskFile.arrayBuffer();

        const response = await env.AI.run('@cf/runwayml/stable-diffusion-v1-5-inpainting', {
  prompt: 'seamless background texture fill, empty space, blended edges, no characters, high quality',
  negative_prompt: 'text, words, letters, numbers, typography, font, watermark, logo, title, credits, billing block, signature, caption, subtitle, UI, character, person, figure, man, woman, human, floating objects, disjointed textures, blurred edges, smudges, poorly drawn, oversaturated',
  image: [...new Uint8Array(imageBuffer)],
  mask: [...new Uint8Array(maskBuffer)],
  guidance: 12.5,
  num_steps: 20,
  strength: 0.92
});

        return new Response(response, {
          headers: { 'content-type': 'image/jpeg' },
        });

      } catch (error) {
        return new Response(error.message || 'Internal AI Model Framework Error', { status: 500 });
      }
    }

    // Default Fallback Response
    return new Response('Resource Route Node Not Found', { status: 404 });
  }
};
