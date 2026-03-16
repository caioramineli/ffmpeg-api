// ============================================================
// Como chamar o ffmpeg-service a partir do seu monolito (TS)
// ============================================================
//
// Instale no monolito:
//   npm install form-data node-fetch
//   npm install -D @types/node-fetch
//
// Variável de ambiente necessária no monolito:
//   FFMPEG_SERVICE_URL=http://ffmpeg-service:3001
//   (no EasyPanel, use o nome do serviço como hostname)
// ============================================================

import FormData from 'form-data';
import fetch from 'node-fetch';

const FFMPEG_SERVICE_URL = process.env.FFMPEG_SERVICE_URL || 'http://ffmpeg-service:3001';

/**
 * Envia um vídeo pro ffmpeg-service, que comprime e faz upload pro bucket.
 * Retorna a key do arquivo no bucket.
 *
 * @param videoBuffer - Buffer do vídeo recebido do usuário
 * @param filename    - Nome original do arquivo
 */
export async function uploadVideo(videoBuffer: Buffer, filename: string): Promise<{ key: string; url?: string }> {
  const form = new FormData();
  form.append('video', videoBuffer, {
    filename,
    contentType: 'video/mp4',
  });
  form.append('filename', filename);

  const response = await fetch(`${FFMPEG_SERVICE_URL}/compress`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ffmpeg-service retornou erro ${response.status}: ${error}`);
  }

  const data = (await response.json()) as { key: string; url?: string };
  return data;
}

// ============================================================
// Exemplo de uso em uma rota Express do monolito:
// ============================================================
//
// import multer from 'multer';
// import { uploadVideo } from './video-uploader';
//
// const upload = multer({ storage: multer.memoryStorage() });
//
// app.post('/upload', upload.single('video'), async (req, res) => {
//   const key = await uploadVideo(req.file.buffer, req.file.originalname);
//   res.json({ key });
// });
