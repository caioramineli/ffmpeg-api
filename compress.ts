import ffmpeg from 'fluent-ffmpeg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function compressAndUpload(
  inputBuffer: Buffer,
  originalFilename: string,
  bucket: string
): Promise<string> {
  const tmpDir = os.tmpdir();
  const uid = uuidv4();
  const ext = path.extname(originalFilename) || '.mp4';
  const inputPath = path.join(tmpDir, `input-${uid}${ext}`);
  const outputPath = path.join(tmpDir, `output-${uid}.mp4`);

  // Salva o buffer recebido em disco temporário
  fs.writeFileSync(inputPath, inputBuffer);

  try {
    // Comprime com FFmpeg
    await runFFmpeg(inputPath, outputPath);

    // Lê o arquivo comprimido
    const compressedBuffer = fs.readFileSync(outputPath);

    const originalSize = inputBuffer.length;
    const compressedSize = compressedBuffer.length;
    const reduction = (((originalSize - compressedSize) / originalSize) * 100).toFixed(1);
    console.log(
      `[compress] ${originalFilename}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (-${reduction}%)`
    );

    // Faz upload pro S3/bucket
    const key = `videos/${uid}-${path.basename(originalFilename, ext)}.mp4`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: compressedBuffer,
        ContentType: 'video/mp4',
      })
    );

    return key;
  } finally {
    // Limpa arquivos temporários mesmo se der erro
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}

function runFFmpeg(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',       // Codec H.264 — melhor compressão/compatibilidade
        '-crf 28',            // Qualidade: 18=alta qualidade, 28=boa compressão, 35+=baixa
        '-preset fast',       // Velocidade de encoding (ultrafast/fast/medium/slow)
        '-c:a aac',           // Codec de áudio
        '-b:a 128k',          // Bitrate do áudio
        '-movflags +faststart', // Permite streaming antes do download completo
        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', // Garante dimensões pares (exigido pelo H.264)
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log('[ffmpeg] Comando:', cmd))
      .on('progress', (p) => console.log(`[ffmpeg] Progresso: ${p.percent?.toFixed(1)}%`))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function formatBytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
}
