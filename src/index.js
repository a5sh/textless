// src/index.js - Advanced Textless Poster Generator with Multi-Scale Ensemble Masking

const HTML_CONTENT = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Advanced Textless Poster Generator</title>
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
    height: 220px;
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
  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
  }
  .result-card {
    text-align: center;
  }
  .result-card h3 {
    font-size: 0.95rem;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 0.5rem;
  }
  .result-card p {
    font-size: 0.75rem;
    color: #64748b;
    margin-bottom: 0.5rem;
  }
  .controls {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .control-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .control-group label {
    font-size: 0.85rem;
    color: #475569;
  }
  .control-group input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
  .control-group input[type="range"] {
    width: 120px;
  }
</style>
</head>
<body class="min-h-screen text-slate-900 p-6 md:p-8 font-sans">
  <div class="max-w-7xl mx-auto bg-white/90 backdrop-blur border border-slate-200 rounded-3xl shadow-xl p-6 md:p-8">
    <div class="text-center mb-7">
      <h1 class="text-3xl md:text-4xl font-black tracking-tight text-slate-900">Advanced Textless Poster</h1>
      <p class="mt-2 text-slate-600">
        Multi-scale ensemble masking with adaptive thresholding and optional dual-pass inpainting.
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

      <div class="controls">
        <div class="control-group">
          <label for="dualPass">Dual-Pass Inpainting:</label>
          <input type="checkbox" id="dualPass" checked />
        </div>
        <div class="control-group">
          <label for="aggressive">Aggression:</label>
          <input type="range" id="aggressive" min="0.5" max="2" step="0.1" value="1" />
          <span id="aggressiveVal">1.0x</span>
        </div>
      </div>

      <div class="w-full mt-5 grid gap-3 md:grid-cols-2">
        <button
          id="generateBtn"
          class="w-full px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-indigo-300 transition shadow-md shadow-indigo-200"
        >
          Generate Enhanced Result
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
        <span id="loadingText">Processing...</span>
      </div>

      <div id="errorMsg" class="hidden mt-4 text-red-600 font-semibold text-sm text-center max-w-2xl"></div>

      <div id="previewSection" class="hidden w-full mt-8">
        <div class="results-grid">
          <div class="result-card">
            <h3>Ensemble Mask</h3>
            <p>Multi-scale, adaptive, combined</p>
            <canvas id="maskEnsemble" width="500" height="750" class="mini-preview mx-auto"></canvas>
          </div>

          <div class="result-card">
            <h3>Refined Mask</h3>
            <p>Post-processed with morphology</p>
            <canvas id="maskRefined" width="500" height="750" class="mini-preview mx-auto"></canvas>
          </div>

          <div class="result-card">
            <h3>Final Result</h3>
            <p>Text-free poster</p>
            <img id="resultFinal" class="preview-image mini-preview mx-auto" alt="Final result" />
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
  const dualPassEl = document.getElementById('dualPass');
  const aggressiveEl = document.getElementById('aggressive');
  const aggressiveValEl = document.getElementById('aggressiveVal');

  const imgCanvas = document.getElementById('imgCanvas');
  const imgCtx = imgCanvas.getContext('2d', { willReadFrequently: true });

  let currentFile = null;
  let isProcessing = false;

  aggressiveEl.addEventListener('input', () => {
    aggressiveValEl.textContent = aggressiveEl.value + 'x';
  });

  function showError(message) {
    errorMsgEl.textContent = message;
    errorMsgEl.classList.remove('hidden');
  }

  function clearError() {
    errorMsgEl.textContent = '';
    errorMsgEl.classList.add('hidden');
  }

  function setLoading(state, text = 'Processing...') {
    loadingTextEl.textContent = text;
    loadingEl.classList.toggle('hidden', !state);
    generateBtn.disabled = state;
    uploadEl.disabled = state;
    resetBtn.disabled = state;
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

  function gaussianBlur(src, width, height, radius) {
    let result = src;
    for (let i = 0; i < 2; i++) result = boxBlur(result, width, height, Math.ceil(radius / 2));
    return result;
  }

  function sobelMagnitude(gray, width, height) {
    const out = new Float32Array(width * height);
    let sum = 0, sumSq = 0, count = 0;

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

  function laplacian(gray, width, height) {
    const out = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;
        const center = gray[idx];
        const sum = -4 * center
          + gray[idx - 1] + gray[idx + 1]
          + gray[idx - width] + gray[idx + width];
        out[idx] = Math.abs(sum);
      }
    }
    return out;
  }

  function adaptiveThreshold(gray, width, height, blockSize = 31, constant = 5) {
    const half = Math.floor(blockSize / 2);
    const blur = boxBlur(gray, width, height, half);
    const out = new Uint8Array(width * height);

    for (let i = 0; i < gray.length; i++) {
      out[i] = gray[i] > blur[i] - constant ? 1 : 0;
    }
    return out;
  }

  function thresholdMap(map, width, height, threshold) {
    const out = new Uint8Array(width * height);
    for (let i = 0; i < map.length; i++) out[i] = map[i] >= threshold ? 1 : 0;
    return out;
  }

  function dilate(mask, width, height, passes = 1, size = 1) {
    let cur = mask;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Uint8Array(width * height);
      for (let y = size; y < height - size; y++) {
        const row = y * width;
        for (let x = size; x < width - size; x++) {
          let on = 0;
          for (let dy = -size; dy <= size && !on; dy++) {
            const nRow = (y + dy) * width;
            for (let dx = -size; dx <= size; dx++) {
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

  function erode(mask, width, height, passes = 1, size = 1) {
    let cur = mask;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Uint8Array(width * height);
      for (let y = size; y < height - size; y++) {
        const row = y * width;
        for (let x = size; x < width - size; x++) {
          let keep = 1;
          for (let dy = -size; dy <= size && keep; dy++) {
            const nRow = (y + dy) * width;
            for (let dx = -size; dx <= size; dx++) {
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

  function close(mask, width, height, passes = 1, size = 1) {
    return erode(dilate(mask, width, height, passes, size), width, height, passes, size);
  }

  function open(mask, width, height, passes = 1, size = 1) {
    return dilate(erode(mask, width, height, passes, size), width, height, passes, size);
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

  function smartComponentFilter(comps, width, height, aggression = 1.0) {
    const minAreaRatio = 0.00006 * aggression;
    const maxAreaRatio = 0.18 / aggression;
    const keep = [];

    for (const c of comps) {
      const boxW = c.maxX - c.minX + 1;
      const boxH = c.maxY - c.minY + 1;
      const areaRatio = c.area / (width * height);
      const aspect = boxW / Math.max(1, boxH);
      const circularity = (4 * Math.PI * c.area) / Math.pow(boxW + boxH, 2);

      if (areaRatio < minAreaRatio) continue;
      if (areaRatio > maxAreaRatio) continue;
      if (boxW < 3 || boxH < 2) continue;

      // Reject overly square-ish (likely not text)
      if (aspect > 1.3 && aspect < 0.77 && circularity < 0.3) continue;

      // Reject ultra-thin lines
      if (aspect > 20 || aspect < 0.05) continue;

      keep.push(c);
    }

    return keep;
  }

  function maskToFloat(mask, width, height) {
    const out = new Float32Array(width * height);
    for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 1.0 : 0.0;
    return out;
  }

  function combineMasks(maskA, maskB, maskC, width, height, method = 'max') {
    const out = new Uint8Array(width * height);
    if (method === 'max') {
      for (let i = 0; i < width * height; i++) {
        out[i] = Math.max(maskA[i], maskB[i], maskC[i]);
      }
    } else if (method === 'weighted') {
      // Weight: A=0.25, B=0.30, C=0.45 (C was best)
      for (let i = 0; i < width * height; i++) {
        out[i] = (maskA[i] * 0.25 + maskB[i] * 0.30 + maskC[i] * 0.45) > 0.4 ? 1 : 0;
      }
    }
    return out;
  }

  function refineComponentMask(mask, width, height) {
    let refined = open(mask, width, height, 1, 1);
    refined = close(refined, width, height, 2, 1);
    refined = dilate(refined, width, height, 1, 1);
    refined = erode(refined, width, height, 1, 1);
    return refined;
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

  // Advanced detector: Multi-scale Contrast Detection
  function detectorA_Advanced(gray, width, height, aggression) {
    const scales = [4, 8, 16];
    const scores = [];

    for (const scale of scales) {
      const blur = boxBlur(gray, width, height, scale);
      const scaleScore = new Float32Array(width * height);
      for (let i = 0; i < scaleScore.length; i++) {
        scaleScore[i] = Math.abs(gray[i] - blur[i]);
      }
      scores.push(scaleScore);
    }

    const combined = new Float32Array(width * height);
    for (let i = 0; i < combined.length; i++) {
      combined[i] = Math.max(scores[0][i], scores[1][i] * 0.8, scores[2][i] * 0.6);
    }

    let sum = 0, sumSq = 0;
    for (let i = 0; i < combined.length; i++) {
      sum += combined[i];
      sumSq += combined[i] * combined[i];
    }

    const mean = sum / combined.length;
    const std = Math.sqrt(Math.max(0, sumSq / combined.length - mean * mean));
    const thresh = mean + std * (1.2 / aggression);

    const binary = thresholdMap(combined, width, height, thresh);
    let mask = close(open(binary, width, height, 1, 1), width, height, 2, 1);

    const comps = extractComponents(mask, width, height);
    const keep = smartComponentFilter(comps, width, height, aggression);
    mask = fillComponentBoxes(keep, width, height, 6, 4);
    mask = close(mask, width, height, 2, 1);
    return mask;
  }

  // Advanced detector: Multi-scale Edge Detection
  function detectorB_Advanced(gray, width, height, aggression) {
    const sobel = sobelMagnitude(gray, width, height);
    const laplace = laplacian(gray, width, height);

    const combined = new Float32Array(width * height);
    for (let i = 0; i < combined.length; i++) {
      combined[i] = sobel.map[i] * 0.6 + laplace[i] * 0.4;
    }

    const blurred = boxBlur(combined, width, height, 3);

    let sum = 0, sumSq = 0;
    for (let i = 0; i < blurred.length; i++) {
      sum += blurred[i];
      sumSq += blurred[i] * blurred[i];
    }

    const mean = sum / blurred.length;
    const std = Math.sqrt(Math.max(0, sumSq / blurred.length - mean * mean));
    const thresh = mean + std * (0.95 / aggression);

    const binary = thresholdMap(blurred, width, height, thresh);
    let mask = close(open(binary, width, height, 1, 1), width, height, 1, 1);

    const comps = extractComponents(mask, width, height);
    const keep = smartComponentFilter(comps, width, height, aggression);
    mask = fillComponentBoxes(keep, width, height, 5, 3);
    mask = close(mask, width, height, 1, 1);
    return mask;
  }

  // Advanced detector: Adaptive Multi-scale Brightness
  function detectorC_Advanced(gray, width, height, aggression) {
    const blur8 = boxBlur(gray, width, height, 8);
    const blur16 = boxBlur(gray, width, height, 16);

    const score = new Float32Array(width * height);
    for (let i = 0; i < score.length; i++) {
      const d1 = Math.abs(gray[i] - blur8[i]);
      const d2 = Math.abs(gray[i] - blur16[i]);
      score[i] = Math.max(d1 * 1.1, d2 * 0.9);
    }

    let sum = 0, sumSq = 0;
    for (let i = 0; i < score.length; i++) {
      sum += score[i];
      sumSq += score[i] * score[i];
    }

    const mean = sum / score.length;
    const std = Math.sqrt(Math.max(0, sumSq / score.length - mean * mean));
    const thresh = mean + std * (1.0 / aggression);

    const binary = thresholdMap(score, width, height, thresh);
    let mask = close(open(binary, width, height, 1, 1), width, height, 2, 1);

    const comps = extractComponents(mask, width, height);
    const keep = smartComponentFilter(comps, width, height, aggression);
    mask = fillComponentBoxes(keep, width, height, 7, 5);
    mask = close(mask, width, height, 3, 1);
    return mask;
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

    const aggression = parseFloat(aggressiveEl.value);
    const useDualPass = dualPassEl.checked;

    try {
      setLoading(true, 'Building ensemble mask (multi-scale detection)...');
      const sourceData = imgCtx.getImageData(0, 0, W, H);
      const gray = makeGray(sourceData);

      const maskA = detectorA_Advanced(gray, W, H, aggression);
      const maskB = detectorB_Advanced(gray, W, H, aggression);
      const maskC = detectorC_Advanced(gray, W, H, aggression);

      const ensemble = combineMasks(maskA, maskB, maskC, W, H, 'weighted');
      drawMaskToCanvas(ensemble, W, H, document.getElementById('maskEnsemble'));

      setLoading(true, 'Refining mask with advanced morphology...');
      const refined = refineComponentMask(ensemble, W, H);
      drawMaskToCanvas(refined, W, H, document.getElementById('maskRefined'));

      setLoading(true, useDualPass ? 'Running dual-pass inpainting...' : 'Running inpainting...');

      const imageBlob = await new Promise(resolve => imgCanvas.toBlob(resolve, 'image/jpeg', 0.92));

      const inpaintOnce = async (maskCanvas) => {
        const maskBlob = await canvasToBlob(maskCanvas, 'image/png');
        const formData = new FormData();
        formData.append('image', imageBlob);
        formData.append('mask', maskBlob);

        const response = await fetch('/api/inpainting', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('Inpainting failed: ' + response.status);

        const resultBlob = await response.blob();
        const resultImg = await imageBlobToImage(resultBlob);

        const cleanCanvas = document.createElement('canvas');
        cleanCanvas.width = W;
        cleanCanvas.height = H;
        const cleanCtx = cleanCanvas.getContext('2d');

        const inferCanvas = document.createElement('canvas');
        inferCanvas.width = INFER_W;
        inferCanvas.height = INFER_H;
        const inferCtx = inferCanvas.getContext('2d');
        inferCtx.fillStyle = '#000000';
        inferCtx.fillRect(0, 0, INFER_W, INFER_H);
        inferCtx.drawImage(maskCanvas, PAD_X, PAD_Y, W, H);
        const padding = await canvasToBlob(inferCanvas);
        const paddedImg = await imageBlobToImage(padding);

        cleanCtx.drawImage(resultImg, -PAD_X, -PAD_Y, INFER_W, INFER_H);
        return await canvasToBlob(cleanCanvas, 'image/jpeg', 0.95);
      };

      let finalBlob = await inpaintOnce(document.getElementById('maskRefined'));

      if (useDualPass) {
        setLoading(true, 'Second pass: refining details...');
        const secondPassImg = await imageBlobToImage(finalBlob);
        const secondCanvas = document.createElement('canvas');
        secondCanvas.width = W;
        secondCanvas.height = H;
        const secondCtx = secondCanvas.getContext('2d');
        secondCtx.drawImage(secondPassImg, 0, 0);

        // Lighter mask for second pass
        const refinedLight = erode(refined, W, H, 1, 1);
        drawMaskToCanvas(refinedLight, W, H, document.getElementById('maskRefined'));

        finalBlob = await inpaintOnce(document.getElementById('maskRefined'));
      }

      document.getElementById('resultFinal').src = URL.createObjectURL(finalBlob);
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

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML_CONTENT, {
        headers: { 'content-type': 'text/html;charset=UTF-8' },
      });
    }

    if (url.pathname === '/api/inpainting' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        const maskFile = formData.get('mask');

        if (!imageFile || !maskFile) {
          return new Response('Missing image or mask file.', { status: 400 });
        }

        const imageBuffer = await imageFile.arrayBuffer();
        const maskBuffer = await maskFile.arrayBuffer();

        const imageArray = new Uint8Array(imageBuffer);
        const maskArray = new Uint8Array(maskBuffer);

        console.log(`Image: ${imageArray.length} bytes, Mask: ${maskArray.length} bytes`);

        try {
          const response = await env.AI.run('@cf/runwayml/stable-diffusion-v1-5-inpainting', {
            prompt: 'seamless background texture, natural fill, smooth blending, high quality',
            negative_prompt: 'text, words, watermark, artifacts, blurry, low quality',
            image: imageArray,
            mask: maskArray,
            guidance: 12.5,
            num_steps: 20,
            strength: 0.9
          });

          return new Response(response, {
            headers: { 'content-type': 'image/jpeg' },
          });
        } catch (aiError) {
          console.error('AI Error:', aiError.message);
          const msg = aiError.message || '';
          
          if (msg.includes('rate') || msg.includes('quota')) {
            return new Response('Rate limited or quota exceeded. Try again in a moment.', { status: 429 });
          }
          if (msg.includes('size') || msg.includes('dimension')) {
            return new Response('Image/mask size error. Both must be 500x750.', { status: 400 });
          }
          if (msg.includes('timeout')) {
            return new Response('Inpainting timeout. Try again.', { status: 408 });
          }
          throw aiError;
        }

      } catch (error) {
        console.error('Endpoint error:', error);
        return new Response(`Inpainting error: ${error.message || 'Unknown error'}`, { status: 500 });
      }
    }

    return new Response('Resource Route Node Not Found', { status: 404 });
  }
};
