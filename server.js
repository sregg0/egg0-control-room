import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 5173;

  app.use(express.json());

  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  app.use('/uploads', express.static(uploadDir));

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  });
  const upload = multer({ storage });

  let currentProgram = {
    sceneName: 'INTRO',
    layers: [],
    participants: []
  };

  // API Program
  app.get('/api/program', (req, res) => {
    res.json(currentProgram);
  });

  app.post('/api/program', (req, res) => {
    currentProgram = req.body;
    res.json({ success: true, currentProgram });
  });

  // Ruta /output limpia para la Browser Source de OBS
  app.get('/output', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Egg0limpiadas Output</title>
        <style>
          body { margin: 0; background: #000; color: #fff; font-family: monospace; overflow: hidden; }
          #canvas-output { width: 1920px; height: 1080px; position: relative; display: flex; align-items: center; justify-content: center; }
          h1 { font-size: 4rem; border-bottom: 6px solid #ff007f; padding-bottom: 20px; }
        </style>
      </head>
      <body>
        <div id="canvas-output">
          <h1 id="scene-title">Cargando escena...</h1>
        </div>
        <script>
          async function pollProgram() {
            try {
              const res = await fetch('/api/program');
              const data = await res.json();
              document.getElementById('scene-title').innerText = "PROGRAM: " + data.sceneName;
            } catch(e) {}
          }
          setInterval(pollProgram, 300);
        </script>
      </body>
      </html>
    `);
  });

  const vite = await createViteServer({ server: { middlewareMode: true } });
  app.use(vite.middlewares);

  app.listen(PORT, () => {
    console.log(`🚀 Egg0limpiadas Control Room V16 en http://localhost:${PORT}`);
    console.log(`📺 OBS Browser Source: http://localhost:${PORT}/output`);
  });
}

startServer();