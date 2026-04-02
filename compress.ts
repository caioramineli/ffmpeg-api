import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);
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

export type CompressionResult = {
  key: string;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
};

export async function compressAndUpload(
  inputBuffer: Buffer,
  originalFilename: string,
  bucket: string,
  options?: { webhookUrl?: string; mediaId?: number; networkId?: number }
): Promise<CompressionResult> {
  const tmpDir = os.tmpdir();
  const uid = uuidv4();
  const ext = path.extname(originalFilename) || '.mp4';
  const inputPath = path.join(tmpDir, `input-${uid}${ext}`);
  const outputPath = path.join(tmpDir, `output-${uid}.mp4`);

  // Salva o buffer recebido em disco temporário
  fs.writeFileSync(inputPath, inputBuffer);

  try {
    // Comprime com FFmpeg
    const duration = await getDuration(inputPath);
    await runFFmpeg(inputPath, outputPath, duration, options);

    // Lê o arquivo comprimido
    const compressedBuffer = fs.readFileSync(outputPath);

    const originalSize = inputBuffer.length;
    const compressedSize = compressedBuffer.length;
    const reduction = ((originalSize - compressedSize) / originalSize) * 100;
    console.log(
      `[compress] ${originalFilename}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (-${reduction.toFixed(1)}%)`
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

    return {
      key,
      originalSize,
      compressedSize,
      reductionPercent: Number(reduction.toFixed(1)),
    };
  } finally {
    // Limpa arquivos temporários mesmo se der erro
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}

function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration ?? 0);
    });
  });
}

function timemarkToSeconds(timemark: string): number {
  const [h, m, s] = timemark.split(':');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}

function runFFmpeg(
  inputPath: string, 
  outputPath: string, 
  totalDuration: number,
  options?: { webhookUrl?: string; mediaId?: number; networkId?: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let lastReportedTime = 0;

    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',       // Codec H.264 — melhor compressão/compatibilidade
        '-crf 28',            // Qualidade: 18=alta qualidade, 28=boa compressão, 35+=baixa
        '-preset ultrafast',  // Otimizado para menor uso de CPU pelo servidor (mais rápido)
        '-c:a aac',           // Codec de áudio
        '-b:a 128k',          // Bitrate do áudio
        '-movflags +faststart', // Permite streaming antes do download completo
        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', // Garante dimensões pares (exigido pelo H.264)
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log('[ffmpeg] Comando:', cmd))
      .on('progress', (p) => {
        if (p.timemark && totalDuration > 0) {
          const current = timemarkToSeconds(p.timemark);
          
          // Throttling: Enviar atualização pelo menos a cada 1 segundo (evita spamar o webhook com chamadas)
          const now = Date.now();
          if (now - lastReportedTime >= 1000 || current >= totalDuration * 0.99) {
            const percent = Math.min((current / totalDuration) * 100, 100).toFixed(1);
            process.stdout.write(`\r[ffmpeg] Progresso: ${percent}%   `);
            
            if (options?.webhookUrl && options?.mediaId) {
              fetch(options.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  mediaId: options.mediaId,
                  networkId: options.networkId,
                  progress: Number(percent)
                })
              }).catch(() => {}); // Fire and forget silencioso
            }

            lastReportedTime = now;
          }
        }
      })
      .on('end', () => { process.stdout.write('\n'); resolve(); })
      .on('error', (err) => reject(err))
      .run();
  });
}

function formatBytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
}
