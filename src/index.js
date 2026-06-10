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

  function addToScoreMap(score, add, weight = 1) {
    for (let i = 0; i < score.length; i++) score[i] += add[i] * weight;
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

  function mergeBoxes(boxes, xGap, yGap) {
    let cur = boxes.map(b => ({ ...b }));
    let changed = true;

    const closeEnough = (a, b) => {
      const hg = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX) - 1);
      const vg = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY) - 1);
      return hg <= xGap && vg <= yGap;
    };

    while (changed) {
      changed = false;
      cur.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
      const next = [];
      for (const box of cur) {
        let merged = false;
        for (const target of next) {
          if (closeEnough(target, box)) {
            target.minX = Math.min(target.minX, box.minX);
            target.minY = Math.min(target.minY, box.minY);
            target.maxX = Math.max(target.maxX, box.maxX);
            target.maxY = Math.max(target.maxY, box.maxY);
            merged = true;
            changed = true;
            break;
          }
        }
        if (!merged) next.push({ ...box });
      }
      cur = next;
    }

    return cur;
  }

  function scoreComponent(c, width, height, edgeMap, contrastMap, grayMap) {
    const boxW = c.maxX - c.minX + 1;
    const boxH = c.maxY - c.minY + 1;
    const boxArea = Math.max(1, boxW * boxH);
    const areaRatio = c.area / (width * height);
    const fill = c.area / boxArea;
    const aspect = boxW / Math.max(1, boxH);
    const cx = (c.minX + c.maxX) / 2 / width;
    const cy = (c.minY + c.maxY) / 2 / height;

    let edgeSum = 0, contrastSum = 0, graySum = 0;
    for (let y = c.minY; y <= c.maxY; y++) {
      const row = y * width;
      for (let x = c.minX; x <= c.maxX; x++) {
        const idx = row + x;
        edgeSum += edgeMap[idx] || 0;
        contrastSum += contrastMap[idx] || 0;
        graySum += grayMap[idx] || 0;
      }
    }

    const edgeMean = edgeSum / boxArea;
    const contrastMean = contrastSum / boxArea;
    const grayMean = graySum / boxArea;

    let s = 0;

    if (areaRatio >= 0.00005 && areaRatio <= 0.08) s += 1.2;
    if (fill >= 0.02 && fill <= 0.85) s += 1.0;
    if (aspect >= 0.15 && aspect <= 30) s += 0.8;
    if (aspect >= 1.2) s += 0.8;
    if (boxH <= height * 0.38) s += 0.5;
    if (cy >= 0.35) s += 0.7;
    if (cy >= 0.55) s += 0.8;
    if (cx >= 0.12 && cx <= 0.88) s += 0.8;
    if (grayMean >= 90) s += 0.5;
    if (grayMean >= 130) s += 0.4;
    s += Math.min(2.2, edgeMean / 22);
    s += Math.min(1.8, contrastMean / 18);

    if (c.minX <= 4 || c.maxX >= width - 5) s -= 1.2;
    if (c.minY <= 4) s -= 0.3;
    if (boxH > height * 0.45) s -= 1.5;
    if (aspect < 0.12 && boxH > height * 0.12) s -= 1.0;

    return s;
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
    const medium = components.filter(c => c.area >= 20 && c.area <= width * height * 0.03).length;
    const wide = components.filter(c => (c.maxX - c.minX + 1) / Math.max(1, (c.maxY - c.minY + 1)) > 1.3).length;

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
    const std = Math.sqrt(Math.max(0, sumSq / score.length - mean * mean));
    return buildMaskFromScoreMap(score, width, height, mean + std * 1.0, 0.00006);
  }

  function detectorBEdges(gray, width, height) {
    const { map: edges, mean, std } = sobelMagnitude(gray, width, height);
    const blur = boxBlur(gray, width, height, 6);
    const contrast = new Float32Array(width * height);
    const score = new Float32Array(width * height);

    for (let i = 0; i < score.length; i++) {
      contrast[i] = Math.abs(gray[i] - blur[i]);
      const y = Math.floor(i / width) / height;
      const x = (i % width) / width;
      const centerBoost = x > 0.10 && x < 0.90 ? 1 : 0.2;
      const bottomBoost = y > 0.42 ? 10 : 0;
      score[i] = edges[i] * 1.05 + contrast[i] * 0.95 + bottomBoost + centerBoost;
    }

    const thr = mean + std * 1.05;
    let binary = new Uint8Array(width * height);
    for (let i = 0; i < score.length; i++) {
      binary[i] = score[i] >= thr ? 1 : 0;
    }

    binary = close(open(binary, width, height, 1), width, height, 1);
    const comps = extractComponents(binary, width, height);
    const keep = [];
    for (const c of comps) {
      const boxW = c.maxX - c.minX + 1;
      const boxH = c.maxY - c.minY + 1;
      const areaRatio = c.area / (width * height);
      const aspect = boxW / Math.max(1, boxH);
      if (areaRatio < 0.00006 || areaRatio > 0.10) continue;
      if (boxH > height * 0.42) continue;
      if (aspect < 0.10 && boxH > height * 0.12) continue;
      keep.push(c);
    }
    let mask = fillComponentBoxes(keep, width, height, 6, 4);
    mask = close(mask, width, height, 1);
    return mask;
  }

  function detectorCRows(gray, width, height) {
    const blur = boxBlur(gray, width, height, 5);
    const rowScore = new Float32Array(height);
    const colScore = new Float32Array(width);

    for (let y = 0; y < height; y++) {
      let rs = 0;
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const local = Math.abs(gray[idx] - blur[idx]);
        const bright = gray[idx] > 125 ? (gray[idx] - 125) * 0.15 : 0;
        const lowerBoost = y > height * 0.46 ? 1.4 : 0.45;
        const centerBoost = x > width * 0.10 && x < width * 0.90 ? 1 : 0.5;
        rs += local * lowerBoost + bright * centerBoost;
        colScore[x] += local * 0.06;
      }
      rowScore[y] = rs;
    }

    const rowBlur = boxBlur(rowScore, 1, height, 7);
    const rowMean = rowBlur.reduce((a, b) => a + b, 0) / height;
    let rowSq = 0;
    for (let i = 0; i < height; i++) rowSq += rowBlur[i] * rowBlur[i];
    const rowStd = Math.sqrt(Math.max(0, rowSq / height - rowMean * rowMean));
    const rowThr = rowMean + rowStd * 0.55;

    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      if (rowBlur[y] < rowThr) continue;
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const local = Math.abs(gray[idx] - blur[idx]);
        if (local > 8 || gray[idx] > 140) mask[idx] = 1;
      }
    }

    let result = close(open(mask, width, height, 1), width, height, 1);
    const comps = extractComponents(result, width, height);
    const keep = [];
    for (const c of comps) {
      const boxW = c.maxX - c.minX + 1;
      const boxH = c.maxY - c.minY + 1;
      const areaRatio = c.area / (width * height);
      const aspect = boxW / Math.max(1, boxH);
      if (areaRatio < 0.00005 || areaRatio > 0.08) continue;
      if (boxH > height * 0.20) continue;
      if (aspect < 0.25 && boxH > 20) continue;
      keep.push(c);
    }
    result = fillComponentBoxes(keep, width, height, 7, 5);
    result = close(result, width, height, 1);
    return result;
  }

  function unionMasks(masks) {
    const out = new Uint8Array(W * H);
    for (const mask of masks) {
      for (let i = 0; i < out.length; i++) {
        if (mask[i]) out[i] = 1;
      }
    }
    return out;
  }

  function refineFinalMask(mask, width, height) {
    let m = close(open(mask, width, height, 1), width, height, 1);
    const comps = extractComponents(m, width, height);

    const keep = [];
    for (const c of comps) {
      const boxW = c.maxX - c.minX + 1;
      const boxH = c.maxY - c.minY + 1;
      const areaRatio = c.area / (width * height);
      const aspect = boxW / Math.max(1, boxH);
      if (areaRatio < 0.00005) continue;
      if (areaRatio > 0.18) continue;
      if (boxW < 4 || boxH < 3) continue;
      if (aspect < 0.08 && boxH > 30) continue;
      keep.push(c);
    }

    m = fillComponentBoxes(keep, width, height, 5, 4);
    m = close(m, width, height, 1);
    return m;
  }

  function buildEnsembleMask(imageData) {
    const gray = makeGray(imageData);

    const m1 = detectorAContrast(gray, W, H);
    const m2 = detectorBEdges(gray, W, H);
    const m3 = detectorCRows(gray, W, H);

    const s1 = scoreMask(m1, W, H);
    const s2 = scoreMask(m2, W, H);
    const s3 = scoreMask(m3, W, H);

    const scored = [
      { name: 'contrast', mask: m1, score: s1 },
      { name: 'edges', mask: m2, score: s2 },
      { name: 'rows', mask: m3, score: s3 }
    ].sort((a, b) => b.score - a.score);

    const top = scored[0];
    const second = scored[1];
    const third = scored[2];

    let chosen = top.mask;

    if (second.score >= top.score * 0.88) {
      chosen = unionMasks([top.mask, second.mask]);
    }

    if (third.score >= top.score * 0.94) {
      chosen = unionMasks([chosen, third.mask]);
    }

    chosen = refineFinalMask(chosen, W, H);

    return {
      mask: chosen,
      debug: scored.map(s => ({
        name: s.name,
        score: s.score.toFixed(2),
        coverage: (sumMask(s.mask) / (W * H) * 100).toFixed(2) + '%'
      }))
    };
  }

  function buildPaddedCanvasFromCanvas(sourceCanvas, outWidth, outHeight, padX, padY, fillBlack = false) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const ctx = outCanvas.getContext('2d', { willReadFrequently: true });

    if (fillBlack) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outWidth, outHeight);
    } else {
      ctx.clearRect(0, 0, outWidth, outHeight);
    }

    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;

    ctx.drawImage(sourceCanvas, padX, padY);

    if (padX > 0) {
      ctx.drawImage(sourceCanvas, 0, 0, 1, sh, 0, padY, padX, sh);
      ctx.drawImage(sourceCanvas, sw - 1, 0, 1, sh, padX + sw, padY, outWidth - (padX + sw), sh);
    }

    if (padY > 0) {
      ctx.drawImage(sourceCanvas, 0, 0, sw, 1, 0, 0, outWidth, padY);
      ctx.drawImage(sourceCanvas, 0, sh - 1, sw, 1, 0, padY + sh, outWidth, outHeight - (padY + sh));
    }

    return outCanvas;
  }

  async function compositeFinalImage(originalCanvas, inpaintedBlob) {
    const inpaintedImg = await imageBlobToImage(inpaintedBlob);

    const inferCanvas = document.createElement('canvas');
    inferCanvas.width = INFER_W;
    inferCanvas.height = INFER_H;
    const inferCtx = inferCanvas.getContext('2d', { willReadFrequently: true });
    inferCtx.drawImage(inpaintedImg, 0, 0, INFER_W, INFER_H);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = W;
    finalCanvas.height = H;
    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });

    finalCtx.drawImage(inferCanvas, PAD_X, PAD_Y, W, H, 0, 0, W, H);
    return canvasToBlob(finalCanvas, 'image/png');
  }

  function renderDiagnostics(items) {
    diagnosticsEl.innerHTML = '';
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'badge';
      el.textContent = `${item.name}: score ${item.score} | ${item.coverage}`;
      diagnosticsEl.appendChild(el);
    }
    diagnosticsEl.classList.remove('hidden');
  }

  async function inpaintWithMask(imageBlob, maskBlob) {
    const fd = new FormData();
    fd.append('image', imageBlob, 'poster.png');
    fd.append('mask', maskBlob, 'mask.png');

    const res = await fetch('/api/inpaint', {
      method: 'POST',
      body: fd
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    return res.blob();
  }

  async function processPoster() {
    if (isProcessing) return;
    if (!currentFile) {
      showError('Upload an image first.');
      return;
    }

    clearError();
    previewSectionEl.classList.add('hidden');
    diagnosticsEl.classList.add('hidden');
    setLoading(true, 'Running browser detectors...');

    isProcessing = true;

    try {
      const imageData = imgCtx.getImageData(0, 0, W, H);
      const { mask, debug } = buildEnsembleMask(imageData);

      renderDiagnostics(debug);
      drawMaskToCanvas(mask, W, H, maskPreviewCanvas);

      const paddedImageCanvas = buildPaddedCanvasFromCanvas(imgCanvas, INFER_W, INFER_H, PAD_X, PAD_Y, false);
      const paddedMaskCanvas = buildPaddedCanvasFromCanvas(maskPreviewCanvas, INFER_W, INFER_H, PAD_X, PAD_Y, true);

      const paddedImageBlob = await canvasToBlob(paddedImageCanvas, 'image/png');
      const paddedMaskBlob = await canvasToBlob(paddedMaskCanvas, 'image/png');

      setLoading(true, 'Inpainting masked regions with Workers AI...');

      const inpaintedBlob = await inpaintWithMask(paddedImageBlob, paddedMaskBlob);
      const finalBlob = await compositeFinalImage(imgCanvas, inpaintedBlob);

      revokeResultUrl();
      currentObjectUrl = URL.createObjectURL(finalBlob);
      resultImgEl.src = currentObjectUrl;
      previewSectionEl.classList.remove('hidden');
    } catch (err) {
      showError('Error: ' + (err?.message || String(err)));
    } finally {
      isProcessing = false;
      setLoading(false);
    }
  }

  async function loadAndDrawFile(file) {
    if (!file) return;
    currentFile = file;
    clearError();
    revokeResultUrl();
    previewSectionEl.classList.add('hidden');
    diagnosticsEl.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        drawImageCover(imgCtx, img, W, H);
      };
      img.onerror = () => showError('Could not read the image file.');
      img.src = event.target.result;
    };
    reader.onerror = () => showError('Could not read the file.');
    reader.readAsDataURL(file);
  }

  uploadEl.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    await loadAndDrawFile(file);
  });

  generateBtn.addEventListener('click', async () => {
    await processPoster();
  });

  resetBtn.addEventListener('click', () => {
    currentFile = null;
    clearError();
    revokeResultUrl();
    diagnosticsEl.classList.add('hidden');
    previewSectionEl.classList.add('hidden');
    imgCtx.clearRect(0, 0, W, H);
    maskPreviewCanvas.getContext('2d').clearRect(0, 0, W, H);
    uploadEl.value = '';
    imgCtx.fillStyle = '#e5e7eb';
    imgCtx.fillRect(0, 0, W, H);
    imgCtx.fillStyle = '#94a3b8';
    imgCtx.font = 'bold 22px system-ui, sans-serif';
    imgCtx.textAlign = 'center';
    imgCtx.fillText('Upload a poster to begin', W / 2, H / 2);
  });

  imgCtx.fillStyle = '#e5e7eb';
  imgCtx.fillRect(0, 0, W, H);
  imgCtx.fillStyle = '#94a3b8';
  imgCtx.font = 'bold 22px system-ui, sans-serif';
  imgCtx.textAlign = 'center';
  imgCtx.fillText('Upload a poster to begin', W / 2, H / 2);
})();
</script>
</body>
</html>`;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function parseFormFile(formData, key) {
  const file = formData.get(key);
  if (!(file instanceof File)) return null;
  return file;
}

function buildPrompt() {
  return [
    'Remove only the masked text regions and reconstruct the original poster artwork underneath.',
    'Preserve the exact subject, pose, clothing, lighting, color palette, composition, and background structure.',
    'Do not redesign the image or invent a new scene.'
  ].join(' ');
}

function buildNegativePrompt() {
  return [
    'text',
    'letters',
    'words',
    'typography',
    'logo',
    'watermark',
    'signature',
    'subtitle',
    'credits',
    'poster redesign',
    'face change',
    'pose change',
    'new person',
    'extra object',
    'curtain',
    'drape',
    'fabric',
    'wallpaper'
  ].join(', ');
}

function buildResponseHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML_CONTENT, {
        headers: buildResponseHeaders('text/html; charset=utf-8')
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/inpaint') {
      try {
        const formData = await request.formData();
        const imageFile = parseFormFile(formData, 'image');
        const maskFile = parseFormFile(formData, 'mask');

        if (!imageFile || !maskFile) {
          return new Response('Missing image or mask payload', { status: 400 });
        }

        const imageBuffer = await imageFile.arrayBuffer();
        const maskBuffer = await maskFile.arrayBuffer();

        const inputs = {
          prompt: buildPrompt(),
          negative_prompt: buildNegativePrompt(),
          image: Array.from(new Uint8Array(imageBuffer)),
          mask: Array.from(new Uint8Array(maskBuffer)),
          width: 504,
          height: 752,
          num_steps: 16,
          strength: 0.55,
          guidance: 4.0
        };

        const response = await env.AI.run('@cf/runwayml/stable-diffusion-v1-5-inpainting', inputs);

        return new Response(response, {
          headers: buildResponseHeaders('image/png')
        });
      } catch (error) {
        return new Response(error?.message || 'Server exception occurred', { status: 500 });
      }
    }

    return new Response('Resource Not Found', { status: 404 });
  }
};
