const HTML_CONTENT = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Textless Poster Generator</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root {
    color-scheme: light;
  }

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
</style>
</head>
<body class="min-h-screen text-slate-900 p-6 md:p-8 font-sans">
  <div class="max-w-4xl mx-auto bg-white/90 backdrop-blur border border-slate-200 rounded-3xl shadow-xl p-6 md:p-8">
    <div class="text-center mb-7">
      <h1 class="text-3xl md:text-4xl font-black tracking-tight text-slate-900">Textless Poster Generator</h1>
      <p class="mt-2 text-slate-600">
        Upload a text-heavy movie poster. The worker removes text using conservative auto-detection and Cloudflare Workers AI inpainting.
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
  const OUTPUT_WIDTH = 500;
  const OUTPUT_HEIGHT = 750;

  // Workers AI requires dimensions divisible by 8
  const INFER_WIDTH = 504;
  const INFER_HEIGHT = 752;
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

  const imgCanvas = document.getElementById('imgCanvas');
  const imgCtx = imgCanvas.getContext('2d', { willReadFrequently: true });

  const maskPreviewCanvas = document.getElementById('maskPreviewCanvas');
  const maskPreviewCtx = maskPreviewCanvas.getContext('2d', { willReadFrequently: true });

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

  function drawImageCover(ctx, img, width, height) {
    ctx.clearRect(0, 0, width, height);
    const scale = Math.max(width / img.width, height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (width - drawW) / 2;
    const y = (height - drawH) / 2;
    ctx.drawImage(img, x, y, drawW, drawH);
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

  function canvasToBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Unable to export canvas.'));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  function getLuma(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function computeEdges(imageData) {
    const { width, height, data } = imageData;
    const total = width * height;
    const gray = new Float32Array(total);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = getLuma(data[i], data[i + 1], data[i + 2]);
    }

    const edges = new Float32Array(total);
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;

        const a = gray[idx - width - 1];
        const b = gray[idx - width];
        const c = gray[idx - width + 1];
        const d = gray[idx - 1];
        const f = gray[idx + 1];
        const g = gray[idx + width - 1];
        const h = gray[idx + width];
        const i = gray[idx + width + 1];

        const gx = (-a) + (-2 * d) + (-g) + c + (2 * f) + i;
        const gy = (-a) + (-2 * b) + (-c) + g + (2 * h) + i;
        const mag = Math.hypot(gx, gy);

        edges[idx] = mag;
        sum += mag;
        sumSq += mag * mag;
        count++;
      }
    }

    const mean = sum / Math.max(1, count);
    const variance = Math.max(0, sumSq / Math.max(1, count) - mean * mean);
    const std = Math.sqrt(variance);

    return { gray, edges, mean, std };
  }

  function dilateBinaryMap(map, width, height, passes = 1) {
    let current = map;

    for (let pass = 0; pass < passes; pass++) {
      const next = new Uint8Array(width * height);

      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          const idx = row + x;
          let on = 0;

          for (let dy = -1; dy <= 1 && !on; dy++) {
            const ny = y + dy;
            const nRow = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              if (current[nRow + x + dx]) {
                on = 1;
                break;
              }
            }
          }

          next[idx] = on;
        }
      }

      current = next;
    }

    return current;
  }

  function erodeBinaryMap(map, width, height, passes = 1) {
    let current = map;

    for (let pass = 0; pass < passes; pass++) {
      const next = new Uint8Array(width * height);

      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          const idx = row + x;
          let keep = 1;

          for (let dy = -1; dy <= 1 && keep; dy++) {
            const ny = y + dy;
            const nRow = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              if (!current[nRow + x + dx]) {
                keep = 0;
                break;
              }
            }
          }

          next[idx] = keep;
        }
      }

      current = next;
    }

    return current;
  }

  function extractComponents(binary, edgeMap, width, height) {
    const visited = new Uint8Array(width * height);
    const components = [];
    const stack = [];

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const start = row + x;
        if (!binary[start] || visited[start]) continue;

        visited[start] = 1;
        stack.length = 0;
        stack.push(start);

        let area = 0;
        let minX = x;
        let minY = y;
        let maxX = x;
        let maxY = y;
        let edgeSum = 0;

        while (stack.length) {
          const idx = stack.pop();
          const px = idx % width;
          const py = (idx / width) | 0;

          area++;
          edgeSum += edgeMap[idx];
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

        components.push({
          area,
          minX,
          minY,
          maxX,
          maxY,
          edgeSum
        });
      }
    }

    return components;
  }

  function componentLooksLikeText(component, width, height, edgeMean, edgeStd, settings) {
    const boxW = component.maxX - component.minX + 1;
    const boxH = component.maxY - component.minY + 1;
    const boxArea = Math.max(1, boxW * boxH);
    const fill = component.area / boxArea;
    const aspect = boxW / Math.max(1, boxH);
    const edgeDensity = component.edgeSum / Math.max(1, component.area);
    const edgeRel = edgeDensity / Math.max(1e-6, edgeMean + edgeStd * 0.5);

    let score = 0;

    if (component.area >= settings.minArea && component.area <= width * height * settings.maxAreaRatio) score++;
    if (fill >= settings.minFill && fill <= settings.maxFill) score++;
    if (edgeRel >= settings.minEdgeRel) score++;
    if (boxW >= 10 && boxH >= 4) score++;
    if (aspect >= 1.15 || aspect <= 0.88) score++;
    if (boxW >= 18 || boxH >= 18) score++;

    return score >= settings.minScore;
  }

  function boxesClose(a, b, xGap, yGap) {
    const horizontalGap = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX) - 1);
    const verticalGap = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY) - 1);
    return horizontalGap <= xGap && verticalGap <= yGap;
  }

  function mergeBoxes(boxes, xGap, yGap) {
    let current = boxes.map(box => ({ ...box }));
    let changed = true;

    while (changed) {
      changed = false;
      current.sort((a, b) => a.minY - b.minY || a.minX - b.minX);

      const next = [];
      for (const box of current) {
        let merged = false;

        for (const target of next) {
          if (boxesClose(target, box, xGap, yGap)) {
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

      current = next;
    }

    return current;
  }

  function fillBoxesToMask(boxes, width, height, padX, padY) {
    const mask = new Uint8Array(width * height);

    for (const box of boxes) {
      const minX = Math.max(0, box.minX - padX);
      const minY = Math.max(0, box.minY - padY);
      const maxX = Math.min(width - 1, box.maxX + padX);
      const maxY = Math.min(height - 1, box.maxY + padY);

      for (let y = minY; y <= maxY; y++) {
        const row = y * width;
        for (let x = minX; x <= maxX; x++) {
          mask[row + x] = 255;
        }
      }
    }

    return mask;
  }

  function countMaskPixels(mask) {
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) count++;
    }
    return count;
  }

  function buildTextMask(imageData) {
    const { width, height } = imageData;
    const { edges, mean, std } = computeEdges(imageData);
    const totalPixels = width * height;

    const tries = [
      {
        edgeStdFactor: 0.95,
        minArea: 12,
        maxAreaRatio: 0.035,
        minFill: 0.03,
        maxFill: 0.58,
        minEdgeRel: 0.82,
        minScore: 4,
        dilatePasses: 1,
        padX: 4,
        padY: 3,
        mergeXGap: 16,
        mergeYGap: 10
      },
      {
        edgeStdFactor: 0.65,
        minArea: 10,
        maxAreaRatio: 0.05,
        minFill: 0.02,
        maxFill: 0.68,
        minEdgeRel: 0.72,
        minScore: 4,
        dilatePasses: 2,
        padX: 6,
        padY: 4,
        mergeXGap: 18,
        mergeYGap: 12
      }
    ];

    let bestMask = new Uint8Array(totalPixels);

    for (const settings of tries) {
      const threshold = mean + std * settings.edgeStdFactor;
      const candidate = new Uint8Array(totalPixels);

      for (let i = 0; i < totalPixels; i++) {
        candidate[i] = edges[i] >= threshold ? 1 : 0;
      }

      let working = dilateBinaryMap(candidate, width, height, settings.dilatePasses);
      working = erodeBinaryMap(working, width, height, 1);

      const components = extractComponents(working, edges, width, height);

      const textBoxes = [];
      for (const comp of components) {
        if (componentLooksLikeText(comp, width, height, mean, std, settings)) {
          textBoxes.push(comp);
        }
      }

      const merged = mergeBoxes(textBoxes, settings.mergeXGap, settings.mergeYGap);
      const mask = fillBoxesToMask(merged, width, height, settings.padX, settings.padY);

      bestMask = mask;

      if (countMaskPixels(mask) > totalPixels * 0.004) {
        break;
      }
    }

    return dilateBinaryMap(bestMask, width, height, 1);
  }

  function maskToCanvas(mask, width, height, canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.createImageData(width, height);

    for (let i = 0; i < mask.length; i++) {
      const v = mask[i];
      const p = i * 4;
      imageData.data[p] = v;
      imageData.data[p + 1] = v;
      imageData.data[p + 2] = v;
      imageData.data[p + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
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

    // Center draw
    ctx.drawImage(sourceCanvas, padX, padY);

    // Edge extension so the extra pixels are not empty shells.
    if (padX > 0) {
      // Left strip
      ctx.drawImage(sourceCanvas, 0, 0, 1, sh, 0, padY, padX, sh);
      // Right strip
      ctx.drawImage(sourceCanvas, sw - 1, 0, 1, sh, padX + sw, padY, outWidth - (padX + sw), sh);
    }

    if (padY > 0) {
      // Top strip
      ctx.drawImage(sourceCanvas, 0, 0, sw, 1, 0, 0, outWidth, padY);
      // Bottom strip
      ctx.drawImage(sourceCanvas, 0, sh - 1, sw, 1, 0, padY + sh, outWidth, outHeight - (padY + sh));
    }

    return outCanvas;
  }

  async function cropResultToOutputSize(resultBlob) {
    const resultImg = await imageBlobToImage(resultBlob);
    const inferCanvas = document.createElement('canvas');
    inferCanvas.width = INFER_WIDTH;
    inferCanvas.height = INFER_HEIGHT;

    const inferCtx = inferCanvas.getContext('2d', { willReadFrequently: true });
    inferCtx.drawImage(resultImg, 0, 0, INFER_WIDTH, INFER_HEIGHT);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = OUTPUT_WIDTH;
    finalCanvas.height = OUTPUT_HEIGHT;

    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
    finalCtx.drawImage(
      inferCanvas,
      PAD_X,
      PAD_Y,
      OUTPUT_WIDTH,
      OUTPUT_HEIGHT,
      0,
      0,
      OUTPUT_WIDTH,
      OUTPUT_HEIGHT
    );

    return canvasToBlob(finalCanvas, 'image/png');
  }

  async function processPoster() {
    if (isProcessing) return;
    if (!currentFile) {
      showError('Upload an image first.');
      return;
    }

    clearError();
    previewSectionEl.classList.add('hidden');
    setLoading(true, 'Detecting text regions...');

    isProcessing = true;

    try {
      const originalBlob = await canvasToBlob(imgCanvas, 'image/png');
      const imageData = imgCtx.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      const mask = buildTextMask(imageData);

      maskToCanvas(mask, OUTPUT_WIDTH, OUTPUT_HEIGHT, maskPreviewCanvas);

      const paddedImageCanvas = buildPaddedCanvasFromCanvas(imgCanvas, INFER_WIDTH, INFER_HEIGHT, PAD_X, PAD_Y, false);
      const paddedMaskCanvas = buildPaddedCanvasFromCanvas(maskPreviewCanvas, INFER_WIDTH, INFER_HEIGHT, PAD_X, PAD_Y, true);

      const paddedImageBlob = await canvasToBlob(paddedImageCanvas, 'image/png');
      const paddedMaskBlob = await canvasToBlob(paddedMaskCanvas, 'image/png');

      const formData = new FormData();
      formData.append('image', paddedImageBlob, 'poster.png');
      formData.append('mask', paddedMaskBlob, 'mask.png');

      setLoading(true, 'Inpainting masked text with Workers AI...');

      const res = await fetch('/api/inpaint', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const inpaintedBlob = await res.blob();
      const finalBlob = await cropResultToOutputSize(inpaintedBlob);

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

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const img = new Image();
        img.onload = async () => {
          drawImageCover(imgCtx, img, OUTPUT_WIDTH, OUTPUT_HEIGHT);
          await processPoster();
        };
        img.onerror = () => showError('Could not read the image file.');
        img.src = event.target.result;
      } catch (err) {
        showError('Could not load image: ' + (err?.message || String(err)));
      }
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
    previewSectionEl.classList.add('hidden');
    imgCtx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    maskPreviewCtx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    uploadEl.value = '';
  });

  imgCtx.fillStyle = '#e5e7eb';
  imgCtx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  imgCtx.fillStyle = '#94a3b8';
  imgCtx.font = 'bold 22px system-ui, sans-serif';
  imgCtx.textAlign = 'center';
  imgCtx.fillText('Upload a poster to begin', OUTPUT_WIDTH / 2, OUTPUT_HEIGHT / 2);
})();
</script>
</body>
</html>`;

function buildPrompt() {
  return [
    'Remove all text from the masked regions and reconstruct the original poster artwork underneath.',
    'Preserve the exact subject, faces, pose, clothing, composition, lighting, and background structure.',
    'Do not redesign the poster or introduce a new scene.'
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML_CONTENT, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/inpaint') {
      try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        const maskFile = formData.get('mask');

        if (!(imageFile instanceof File) || !(maskFile instanceof File)) {
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
          num_steps: 20,
          strength: 0.65,
          guidance: 4.25
        };

        const response = await env.AI.run('@cf/runwayml/stable-diffusion-v1-5-inpainting', inputs);

        return new Response(response, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store'
          }
        });
      } catch (error) {
        return new Response(error?.message || 'Server exception occurred', { status: 500 });
      }
    }

    return new Response('Resource Not Found', { status: 404 });
  }
};
