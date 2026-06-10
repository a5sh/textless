const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Textless Poster Generator</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  .canvas-container {
    position: relative;
    width: 500px;
    height: 750px;
    background: #e5e7eb;
    margin: 0 auto;
    overflow: hidden;
    border-radius: 0.5rem;
  }
  canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
  .preview-container {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }
  .preview-item {
    flex: 1;
    text-align: center;
  }
  .preview-item p {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }
  .preview-image {
    width: 100%;
    max-width: 200px;
    height: 300px;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    object-fit: contain;
    background: #f3f4f6;
  }
</style>
</head>
<body class="bg-slate-50 min-h-screen text-slate-900 p-8 font-sans">
  <div class="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-slate-200">
    <h1 class="text-3xl font-extrabold mb-2 text-center text-slate-800">Textless Poster Generator</h1>
    <p class="mb-8 text-center text-slate-500">Upload a text-filled movie poster. AI automatically detects and removes all text seamlessly.</p>

    <div class="flex flex-col items-center">
      <input type="file" id="upload" accept="image/*" class="mb-6 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition" />
      
      <div class="canvas-container shadow-inner">
        <canvas id="imgCanvas" width="512" height="768"></canvas>
      </div>

      <button id="generateBtn" class="w-full px-6 py-3 bg-indigo-600 text-white rounded-md font-bold hover:bg-indigo-700 disabled:bg-indigo-300 mt-6 mb-4 transition">Generate Textless Poster</button>
      
      <div id="loading" class="hidden mb-4 text-indigo-600 font-semibold animate-pulse flex items-center gap-2">
        <div class="w-4 h-4 bg-indigo-600 rounded-full animate-bounce"></div>
        Detecting text and removing... (~20s)
      </div>
      <div id="errorMsg" class="hidden mb-4 text-red-600 font-semibold text-sm text-center max-w-md"></div>

      <div id="previewSection" class="hidden preview-container w-full">
        <div class="preview-item">
          <p><strong>Detected Text Regions</strong></p>
          <canvas id="maskPreviewCanvas" class="preview-image"></canvas>
        </div>
        <div class="preview-item">
          <p><strong>Result</strong></p>
          <img id="resultImg" class="preview-image" />
        </div>
      </div>
    </div>
  </div>

  <script>
    const imgCanvas = document.getElementById('imgCanvas');
    const imgCtx = imgCanvas.getContext('2d', { willReadFrequently: true });
    const SD_WIDTH = 512;
    const SD_HEIGHT = 768;

    document.getElementById('upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          imgCtx.clearRect(0, 0, SD_WIDTH, SD_HEIGHT);
          const scale = Math.max(SD_WIDTH / img.width, SD_HEIGHT / img.height);
          const x = (SD_WIDTH / 2) - (img.width / 2) * scale;
          const y = (SD_HEIGHT / 2) - (img.height / 2) * scale;
          imgCtx.drawImage(img, x, y, img.width * scale, img.height * scale);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Sobel edge detection to find text regions
    function detectTextRegions(imageData) {
      const width = imageData.width;
      const height = imageData.height;
      const data = imageData.data;
      
      // Convert to grayscale
      const gray = new Uint8Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        gray[i >> 2] = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      }

      // Sobel edge detection
      const edges = new Uint8Array(width * height);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const gx = (-1 * gray[(y-1)*width + (x-1)]) + (-2 * gray[y*width + (x-1)]) + (-1 * gray[(y+1)*width + (x-1)])
                   + (1 * gray[(y-1)*width + (x+1)]) + (2 * gray[y*width + (x+1)]) + (1 * gray[(y+1)*width + (x+1)]);
          const gy = (-1 * gray[(y-1)*width + (x-1)]) + (-2 * gray[(y-1)*width + x]) + (-1 * gray[(y-1)*width + (x+1)])
                   + (1 * gray[(y+1)*width + (x-1)]) + (2 * gray[(y+1)*width + x]) + (1 * gray[(y+1)*width + (x+1)]);
          edges[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
        }
      }

      // Dilate edges to create thicker mask regions
      const dilated = new Uint8Array(width * height);
      const threshold = 40;
      const dilateRadius = 8;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          let maxEdge = edges[idx];
          
          for (let dy = -dilateRadius; dy <= dilateRadius; dy++) {
            for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                maxEdge = Math.max(maxEdge, edges[ny * width + nx]);
              }
            }
          }
          dilated[idx] = maxEdge > threshold ? 255 : 0;
        }
      }

      return dilated;
    }

    document.getElementById('generateBtn').addEventListener('click', async () => {
      const btn = document.getElementById('generateBtn');
      const loading = document.getElementById('loading');
      const errorMsg = document.getElementById('errorMsg');
      const previewSection = document.getElementById('previewSection');

      btn.disabled = true;
      loading.classList.remove('hidden');
      errorMsg.classList.add('hidden');
      previewSection.classList.add('hidden');

      try {
        const imageBlob = await new Promise(resolve => imgCanvas.toBlob(resolve, 'image/png'));
        
        // Detect text regions
        const imageData = imgCtx.getImageData(0, 0, SD_WIDTH, SD_HEIGHT);
        const maskData = detectTextRegions(imageData);

        // Create white mask (inverted: white = remove, black = keep)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = SD_WIDTH;
        maskCanvas.height = SD_HEIGHT;
        const maskCtx = maskCanvas.getContext('2d');
        const maskImageData = maskCtx.createImageData(SD_WIDTH, SD_HEIGHT);
        
        for (let i = 0; i < maskData.length; i++) {
          maskImageData.data[i * 4] = maskData[i];       // R
          maskImageData.data[i * 4 + 1] = maskData[i];   // G
          maskImageData.data[i * 4 + 2] = maskData[i];   // B
          maskImageData.data[i * 4 + 3] = 255;           // A
        }
        maskCtx.putImageData(maskImageData, 0, 0);

        // Show mask preview
        document.getElementById('maskPreviewCanvas').getContext('2d').drawImage(maskCanvas, 0, 0);

        const maskBlob = await new Promise(resolve => maskCanvas.toBlob(resolve, 'image/png'));

        const formData = new FormData();
        formData.append('image', imageBlob);
        formData.append('mask', maskBlob);

        const res = await fetch('/api/inpaint', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());

        const resultBlob = await res.blob();
        document.getElementById('resultImg').src = URL.createObjectURL(resultBlob);
        previewSection.classList.remove('hidden');
      } catch(e) {
        errorMsg.textContent = 'Error: ' + e.message;
        errorMsg.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        loading.classList.add('hidden');
      }
    });
  </script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Serve UI
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML_CONTENT, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 2. Handle AI Inference
    if (request.method === 'POST' && url.pathname === '/api/inpaint') {
      try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        const maskFile = formData.get('mask');

        if (!imageFile || !maskFile) {
          return new Response('Missing payload data', { status: 400 });
        }

        const imageBuffer = await imageFile.arrayBuffer();
        const maskBuffer = await maskFile.arrayBuffer();

        const inputs = {
          prompt: "cinematic background scenery, seamless texture, clear, empty space, highly detailed, visually coherent",
          negative_prompt: "text, letters, words, font, typography, watermark, signature",
          image: Array.from(new Uint8Array(imageBuffer)),
          mask: Array.from(new Uint8Array(maskBuffer)),
          width: 512,
          height: 768,
          guidance: 7.5,
          num_steps: 20,
          strength: 1
        };

        const response = await env.AI.run("@cf/runwayml/stable-diffusion-v1-5-inpainting", inputs);

        return new Response(response, {
          headers: { 'Content-Type': 'image/png' }
        });

      } catch (error) {
        return new Response(error.message || 'Server Exception Occurred', { status: 500 });
      }
    }

    return new Response('Resource Not Found', { status: 404 });
  }
};
