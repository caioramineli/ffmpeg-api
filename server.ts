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
app.post('/compress', upload.any(), async (req, res) => {
  console.log('bateu aqui');
  
  try {
    const file = req.file ?? (req.files as Express.Multer.File[])?.[0];
    if (!file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    const filename = (req.body.filename as string) || file.originalname || 'video.mp4';
    const bucket = process.env.R2_BUCKET_NAME!;

    console.log(`[ffmpeg-service] Recebido: ${filename} (${file.size} bytes)`);

    const result = await compressAndUpload(file.buffer, filename, bucket);

    const publicUrl = process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL}/${result.key}` : undefined;

    console.log(`[ffmpeg-service] Concluído: ${result.key}`);

    res.json({
      key: result.key,
      url: publicUrl,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      reductionPercent: result.reductionPercent,
    });
  } catch (err) {
    console.error('[ffmpeg-service] Erro:', err);
    res.status(500).json({ error: 'Falha ao comprimir ou fazer upload do vídeo.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ffmpeg-service rodando na porta ${PORT}`);
});
