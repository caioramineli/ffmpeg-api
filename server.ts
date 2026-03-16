import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { compressAndUpload } from './compress';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * POST /compress
 * Recebe o vídeo, comprime e faz upload pro bucket.
 * Retorna a key do arquivo no bucket.
 *
 * Form-data:
 *   - video: arquivo de vídeo
 *   - filename: nome original do arquivo (opcional)
 */
app.post('/compress', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    const filename = (req.body.filename as string) || req.file.originalname || 'video.mp4';
    const bucket = process.env.R2_BUCKET_NAME!;

    console.log(`[ffmpeg-service] Recebido: ${filename} (${req.file.size} bytes)`);

    const key = await compressAndUpload(req.file.buffer, filename, bucket);

    const publicUrl = process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL}/${key}` : undefined;

    console.log(`[ffmpeg-service] Concluído: ${key}`);

    res.json({ key, url: publicUrl });
  } catch (err) {
    console.error('[ffmpeg-service] Erro:', err);
    res.status(500).json({ error: 'Falha ao comprimir ou fazer upload do vídeo.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ffmpeg-service rodando na porta ${PORT}`);
});
