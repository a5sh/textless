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
    cursor: crosshair;
  }
</style>
</head>
<body class="bg-slate-50 min-h-screen text-slate-900 p-8 font-sans">
  <div class="max-w-5xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-slate-200">
    <h1 class="text-3xl font-extrabold mb-2 text-center text-slate-800">Poster Text Remover</h1>
    <p class="mb-8 text-center text-slate-500">Upload a raw poster, highlight the text in red, and execute.</p>

    <div class="flex flex-col lg:flex-row gap-10 justify-center">
      <div class="flex flex-col items-center w-[500px]">
        <input type="file" id="upload" accept="image/*" class="mb-4 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition" />
        <div class="canvas-container shadow-inner">
          <canvas id="imgCanvas" width="512" height="768"></canvas>
          <canvas id="drawCanvas" width="512" height="768"></canvas>
        </div>
        <div class="mt-4 flex w-full gap-4 items-center justify-between">
            <div class="flex items-center gap-2">
                <label for="brushSize" class="text-sm font-semibold text-slate-600">Brush:</label>
                <input type="range" id="brushSize" min="5" max="50" value="25" class="cursor-pointer">
            </div>
            <button id="clearBtn" class="px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded hover:bg-slate-300 transition">Clear Mask</button>
        </div>
      </div>

      <div class="flex flex-col items-center w-[500px]">
        <button id="generateBtn" class="w-full px-6 py-3 bg-indigo-600 text-white rounded-md font-bold hover:bg-indigo-700 disabled:bg-indigo-300 mb-4 transition">Remove Text</button>
        <div id="loading" class="hidden mb-4 text-indigo-600 font-semibold animate-pulse">Running AI inference... (~15s)</div>
        <div id="errorMsg" class="hidden mb-4 text-red-600 font-semibold text-sm text-center"></div>
        <div class="w-[500px] h-[750px] border border-slate-200 bg-slate-100 flex items-center justify-center relative overflow-hidden rounded-md shadow-inner">
            <img id="resultImg" class="absolute top-0 left-0 w-full h-full object-cover hidden" />
            <span id="placeholderText" class="text-slate-400 font-medium">Result will appear here</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    const imgCanvas = document.getElementById('imgCanvas');
    const drawCanvas = document.getElementById('drawCanvas');
    const imgCtx = imgCanvas.getContext('2d');
    const drawCtx = drawCanvas.getContext('2d');
    const brushSize = document.getElementById('brushSize');

    let isDrawing = false;
    let strokes = [];
    let currentStroke = [];

    // Force 512x768 buffer logic (required by SD models) mapped to visual 500x750
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
          strokes = [];
          drawCtx.clearRect(0, 0, SD_WIDTH, SD_HEIGHT);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    function getMousePos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        // Scale handles the difference between internal buffer (512x768) and CSS size (500x750)
        return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width),
            y: (evt.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    drawCanvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      const pos = getMousePos(drawCanvas, e);
      currentStroke = [{x: pos.x, y: pos.y, size: parseInt(brushSize.value)}];
    });

    drawCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const pos = getMousePos(drawCanvas, e);
      currentStroke.push({x: pos.x, y: pos.y, size: parseInt(brushSize.value)});
      redrawStrokes();
    });

    const stopDrawing = () => {
      if(isDrawing) {
         isDrawing = false;
         strokes.push([...currentStroke]);
      }
    };
    drawCanvas.addEventListener('mouseup', stopDrawing);
    drawCanvas.addEventListener('mouseleave', stopDrawing);

    function redrawStrokes() {
      drawCtx.clearRect(0, 0, SD_WIDTH, SD_HEIGHT);
      const allStrokes = [...strokes, currentStroke];
      allStrokes.forEach(stroke => {
        if (!stroke || stroke.length === 0) return;
        drawCtx.beginPath();
        drawCtx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          drawCtx.lineTo(stroke[i].x, stroke[i].y);
        }
        drawCtx.lineWidth = stroke[0].size;
        drawCtx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; 
        drawCtx.stroke();
      });
    }

    document.getElementById('clearBtn').addEventListener('click', () => {
      strokes = [];
      currentStroke = [];
      drawCtx.clearRect(0, 0, SD_WIDTH, SD_HEIGHT);
    });

    document.getElementById('generateBtn').addEventListener('click', async () => {
      const btn = document.getElementById('generateBtn');
      const loading = document.getElementById('loading');
      const errorMsg = document.getElementById('errorMsg');
      const resultImg = document.getElementById('resultImg');

      btn.disabled = true;
      loading.classList.remove('hidden');
      errorMsg.classList.add('hidden');

      try {
        const imageBlob = await new Promise(resolve => imgCanvas.toBlob(resolve, 'image/png'));
        
        // Generate valid SD Mask: Black background (keep), White strokes (inpaint area)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = SD_WIDTH;
        tempCanvas.height = SD_HEIGHT;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = 'black';
        tempCtx.fillRect(0, 0, SD_WIDTH, SD_HEIGHT);
        
        tempCtx.lineCap = 'round';
        tempCtx.lineJoin = 'round';
        strokes.forEach(stroke => {
          if (!stroke || stroke.length === 0) return;
          tempCtx.beginPath();
          tempCtx.moveTo(stroke[0].x, stroke[0].y);
          for (let i = 1; i < stroke.length; i++) {
            tempCtx.lineTo(stroke[i].x, stroke[i].y);
          }
          tempCtx.lineWidth = stroke[0].size;
          tempCtx.strokeStyle = 'white';
          tempCtx.stroke();
        });

        const maskBlob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));

        const formData = new FormData();
        formData.append('image', imageBlob);
        formData.append('mask', maskBlob);

        const res = await fetch('/api/inpaint', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());

        const resultBlob = await res.blob();
        resultImg.src = URL.createObjectURL(resultBlob);
        resultImg.classList.remove('hidden');
        document.getElementById('placeholderText').classList.add('hidden');
      } catch(e) {
        errorMsg.textContent = 'Inference Error: ' + e.message;
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

