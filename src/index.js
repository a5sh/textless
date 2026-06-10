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
        Upload a text-heavy movie poster. AI detects text regions, then Workers AI inpaints only those regions.
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
        <span id="loadingText">Detecting text regions with AI...</span>
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

  // Workers AI inpainting needs dimensions divisible by 8.
  const INFER_WIDTH = 504;
  const INFER_HEIGHT = 752;
  const PAD_X = 2;
  const PAD_Y = 1;

  const AI_DETECT_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
  const AI_INPAINT_MODEL = '@cf/runwayml/stable-diffusion-v1-5-inpainting';

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

  function setLoading(state, text = 'Detecting text regions with AI...') {
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

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
  }

  function blobToDataUrl(blob) {
    return blob.arrayBuffer().then((buffer) => {
      const base64 = arrayBufferToBase64(buffer);
      const mime = blob.type || 'image/png';
      return `data:${mime};base64,${base64}`;
    });
  }

  function parseJsonFromModel(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;

    let text = String(raw).trim();

    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  function normalizeRegions(payload, width, height) {
    const regions = Array.isArray(payload?.regions) ? payload.regions : [];
    const cleaned = [];

    for (const r of regions) {
      const x = Math.round(Number(r?.x));
      const y = Math.round(Number(r?.y));
      const w = Math.round(Number(r?.w));
      const h = Math.round(Number(r?.h));
      const confidence = Number.isFinite(Number(r?.confidence)) ? Number(r.confidence) : 1;

      if (![x, y, w, h].every(Number.isFinite)) continue;
      if (confidence < 0.2) continue;

      const nx = clamp(x, 0, width - 1);
      const ny = clamp(y, 0, height - 1);
      const nw = clamp(w, 1, width - nx);
      const nh = clamp(h, 1, height - ny);

      const areaRatio = (nw * nh) / (width * height);
      if (areaRatio < 0.00005) continue;
      if (areaRatio > 0.18) continue;
      if (nw < 3 || nh < 3) continue;

      cleaned.push({
        x: nx,
        y: ny,
        w: nw,
        h: nh,
        confidence: Math.max(0, Math.min(1, confidence)),
        label: typeof r?.label === 'string' ? r.label : 'text'
      });
    }

    return cleaned;
  }

  function drawRegionsToMask(regions, width, height, canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#fff';

    for (const region of regions) {
      const padX = region.w < 30 ? 8 : 6;
      const padY = region.h < 18 ? 6 : 4;
      const x = clamp(region.x - padX, 0, width - 1);
      const y = clamp(region.y - padY, 0, height - 1);
      const w = clamp(region.w + padX * 2, 1, width - x);
      const h = clamp(region.h + padY * 2, 1, height - y);
      ctx.fillRect(x, y, w, h);
    }

    const temp = document.createElement('canvas');
    temp.width = width;
    temp.height = height;
    const tctx = temp.getContext('2d', { willReadFrequently: true });
    tctx.filter = 'blur(2px)';
    tctx.drawImage(canvas, 0, 0);
    tctx.filter = 'none';

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(temp, 0, 0);
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

  async function analyzeTextRegions() {
    const imageBlob = await canvasToBlob(imgCanvas, 'image/png');
    const formData = new FormData();
    formData.append('image', imageBlob, 'poster.png');

    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const data = await res.json();
    return Array.isArray(data.regions) ? data.regions : [];
  }

  async function compositeFinalImage(originalCanvas, inpaintedBlob, maskCanvas) {
    const inpaintedImg = await imageBlobToImage(inpaintedBlob);

    const inferCanvas = document.createElement('canvas');
    inferCanvas.width = INFER_WIDTH;
    inferCanvas.height = INFER_HEIGHT;
    const inferCtx = inferCanvas.getContext('2d', { willReadFrequently: true });
    inferCtx.drawImage(inpaintedImg, 0, 0, INFER_WIDTH, INFER_HEIGHT);

    const croppedInpainted = inferCtx.getImageData(PAD_X, PAD_Y, OUTPUT_WIDTH, OUTPUT_HEIGHT).data;
    const originalData = originalCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT).data;

    const featherCanvas = document.createElement('canvas');
    featherCanvas.width = OUTPUT_WIDTH;
    featherCanvas.height = OUTPUT_HEIGHT;
    const featherCtx = featherCanvas.getContext('2d', { willReadFrequently: true });
    featherCtx.filter = 'blur(2px)';
    featherCtx.drawImage(maskCanvas, 0, 0);
    featherCtx.filter = 'none';
    const featherData = featherCtx.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT).data;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = OUTPUT_WIDTH;
    finalCanvas.height = OUTPUT_HEIGHT;
    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
    const out = finalCtx.createImageData(OUTPUT_WIDTH, OUTPUT_HEIGHT);

    for (let i = 0; i < out.data.length; i += 4) {
      const alpha = featherData[i] / 255;

      out.data[i] = Math.round(originalData[i] * (1 - alpha) + croppedInpainted[i] * alpha);
      out.data[i + 1] = Math.round(originalData[i + 1] * (1 - alpha) + croppedInpainted[i + 1] * alpha);
      out.data[i + 2] = Math.round(originalData[i + 2] * (1 - alpha) + croppedInpainted[i + 2] * alpha);
      out.data[i + 3] = 255;
    }

    finalCtx.putImageData(out, 0, 0);
    return canvasToBlob(finalCanvas, 'image/png');
  }

  async function inpaintPoster(imageBlob, maskBlob) {
    const formData = new FormData();
    formData.append('image', imageBlob, 'poster.png');
    formData.append('mask', maskBlob, 'mask.png');

    const res = await fetch('/api/inpaint', {
      method: 'POST',
      body: formData
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
    setLoading(true, 'AI is locating text regions...');

    isProcessing = true;

    try {
      const regions = await analyzeTextRegions();

      if (!regions.length) {
        throw new Error('AI returned no text regions for this poster.');
      }

      drawRegionsToMask(regions, OUTPUT_WIDTH, OUTPUT_HEIGHT, maskPreviewCanvas);

      const paddedImageCanvas = buildPaddedCanvasFromCanvas(imgCanvas, INFER_WIDTH, INFER_HEIGHT, PAD_X, PAD_Y, false);
      const paddedMaskCanvas = buildPaddedCanvasFromCanvas(maskPreviewCanvas, INFER_WIDTH, INFER_HEIGHT, PAD_X, PAD_Y, true);

      const paddedImageBlob = await canvasToBlob(paddedImageCanvas, 'image/png');
      const paddedMaskBlob = await canvasToBlob(paddedMaskCanvas, 'image/png');

      setLoading(true, 'Inpainting only the detected text regions...');

      const inpaintedBlob = await inpaintPoster(paddedImageBlob, paddedMaskBlob);
      const finalBlob = await compositeFinalImage(imgCanvas, inpaintedBlob, maskPreviewCanvas);

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

    imgCtx.fillStyle = '#e5e7eb';
    imgCtx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    imgCtx.fillStyle = '#94a3b8';
    imgCtx.font = 'bold 22px system-ui, sans-serif';
    imgCtx.textAlign = 'center';
    imgCtx.fillText('Upload a poster to begin', OUTPUT_WIDTH / 2, OUTPUT_HEIGHT / 2);
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function buildPrompt() {
  return [
    'You are detecting printed text regions in a movie poster.',
    'Return ONLY JSON that matches the schema.',
    'Find every visible text block: title, actor names, release date, credits, logos, small copy.',
    'Use tight rectangular boxes around each text block.',
    'Ignore architectural structures, stair rails, fire escapes, lamp posts, faces, clothing, shadows, and background texture unless they contain actual text.',
    'Prefer multiple tight boxes over one huge box.',
    'Use pixel coordinates for a 500x750 image with origin at the top-left.'
  ].join(' ');
}

function buildDetectionSchema() {
  return {
    type: 'object',
    properties: {
      regions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            x: { type: 'integer' },
            y: { type: 'integer' },
            w: { type: 'integer' },
            h: { type: 'integer' },
            confidence: { type: 'number' },
            label: { type: 'string' }
          },
          required: ['x', 'y', 'w', 'h']
        }
      }
    },
    required: ['regions']
  };
}

function parseJsonFromModel(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;

  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeRegions(payload, width, height) {
  const regions = Array.isArray(payload?.regions) ? payload.regions : [];
  const cleaned = [];

  for (const r of regions) {
    const x = Math.round(Number(r?.x));
    const y = Math.round(Number(r?.y));
    const w = Math.round(Number(r?.w));
    const h = Math.round(Number(r?.h));
    const confidence = Number.isFinite(Number(r?.confidence)) ? Number(r.confidence) : 1;

    if (![x, y, w, h].every(Number.isFinite)) continue;
    if (confidence < 0.2) continue;

    const nx = clamp(x, 0, width - 1);
    const ny = clamp(y, 0, height - 1);
    const nw = clamp(w, 1, width - nx);
    const nh = clamp(h, 1, height - ny);

    const areaRatio = (nw * nh) / (width * height);
    if (areaRatio < 0.00005) continue;
    if (areaRatio > 0.18) continue;
    if (nw < 3 || nh < 3) continue;

    cleaned.push({
      x: nx,
      y: ny,
      w: nw,
      h: nh,
      confidence: Math.max(0, Math.min(1, confidence)),
      label: typeof r?.label === 'string' ? r.label : 'text'
    });
  }

  return cleaned;
}

function extractAiText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.response === 'string') return result.response;
  if (typeof result.result === 'string') return result.result;
  return JSON.stringify(result);
}

async function buildDataUrlFromFile(file) {
  const buffer = await file.arrayBuffer();
  const mime = file.type || 'image/png';
  return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML_CONTENT, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/analyze') {
      try {
        const formData = await request.formData();
        const imageFile = formData.get('image');

        if (!(imageFile instanceof File)) {
          return new Response('Missing image payload', { status: 400 });
        }

        const imageDataUrl = await buildDataUrlFromFile(imageFile);

        const response = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
          messages: [
            { role: 'system', content: 'You are a precise computer vision assistant.' },
            { role: 'user', content: buildPrompt() }
          ],
          image: imageDataUrl,
          guided_json: buildDetectionSchema(),
          temperature: 0.1,
          top_p: 0.2,
          max_tokens: 700
        });

        const parsed = parseJsonFromModel(extractAiText(response));
        const regions = normalizeRegions(parsed, 500, 750);

        return Response.json({
          regions,
          count: regions.length
        });
      } catch (error) {
        return new Response(error?.message || 'AI detection failed', { status: 500 });
      }
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
          prompt: 'Remove only the text inside the masked regions and reconstruct the underlying poster artwork. Preserve the exact subject, faces, pose, costume, lighting, color palette, and composition. Do not redesign the image.',
          negative_prompt: 'text, letters, words, typography, logo, watermark, signature, subtitle, credits, poster redesign, face change, pose change, new person, extra object, curtain, drape, fabric, wallpaper',
          image: [...new Uint8Array(imageBuffer)],
          mask: [...new Uint8Array(maskBuffer)],
          width: 504,
          height: 752,
          num_steps: 16,
          strength: 0.55,
          guidance: 4.0
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
