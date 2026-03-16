"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressAndUpload = compressAndUpload;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const ffprobe_static_1 = __importDefault(require("ffprobe-static"));
const client_s3_1 = require("@aws-sdk/client-s3");
if (ffmpeg_static_1.default)
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
fluent_ffmpeg_1.default.setFfprobePath(ffprobe_static_1.default.path);
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const uuid_1 = require("uuid");
const s3 = new client_s3_1.S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});
async function compressAndUpload(inputBuffer, originalFilename, bucket) {
    const tmpDir = os.tmpdir();
    const uid = (0, uuid_1.v4)();
    const ext = path.extname(originalFilename) || '.mp4';
    const inputPath = path.join(tmpDir, `input-${uid}${ext}`);
    const outputPath = path.join(tmpDir, `output-${uid}.mp4`);
    // Salva o buffer recebido em disco temporário
    fs.writeFileSync(inputPath, inputBuffer);
    try {
        // Comprime com FFmpeg
        const duration = await getDuration(inputPath);
        await runFFmpeg(inputPath, outputPath, duration);
        // Lê o arquivo comprimido
        const compressedBuffer = fs.readFileSync(outputPath);
        const originalSize = inputBuffer.length;
        const compressedSize = compressedBuffer.length;
        const reduction = ((originalSize - compressedSize) / originalSize) * 100;
        console.log(`[compress] ${originalFilename}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (-${reduction.toFixed(1)}%)`);
        // Faz upload pro S3/bucket
        const key = `videos/${uid}-${path.basename(originalFilename, ext)}.mp4`;
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: compressedBuffer,
            ContentType: 'video/mp4',
        }));
        return {
            key,
            originalSize,
            compressedSize,
            reductionPercent: Number(reduction.toFixed(1)),
        };
    }
    finally {
        // Limpa arquivos temporários mesmo se der erro
        if (fs.existsSync(inputPath))
            fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath))
            fs.unlinkSync(outputPath);
    }
}
function getDuration(filePath) {
    return new Promise((resolve, reject) => {
        fluent_ffmpeg_1.default.ffprobe(filePath, (err, metadata) => {
            if (err)
                reject(err);
            else
                resolve(metadata.format.duration ?? 0);
        });
    });
}
function timemarkToSeconds(timemark) {
    const [h, m, s] = timemark.split(':');
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}
function runFFmpeg(inputPath, outputPath, totalDuration) {
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(inputPath)
            .outputOptions([
            '-c:v libx264', // Codec H.264 — melhor compressão/compatibilidade
            '-crf 28', // Qualidade: 18=alta qualidade, 28=boa compressão, 35+=baixa
            '-preset fast', // Velocidade de encoding (ultrafast/fast/medium/slow)
            '-c:a aac', // Codec de áudio
            '-b:a 128k', // Bitrate do áudio
            '-movflags +faststart', // Permite streaming antes do download completo
            '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', // Garante dimensões pares (exigido pelo H.264)
        ])
            .output(outputPath)
            .on('start', (cmd) => console.log('[ffmpeg] Comando:', cmd))
            .on('progress', (p) => {
            if (p.timemark && totalDuration > 0) {
                const current = timemarkToSeconds(p.timemark);
                const percent = Math.min((current / totalDuration) * 100, 100).toFixed(1);
                process.stdout.write(`\r[ffmpeg] Progresso: ${percent}%   `);
            }
        })
            .on('end', () => { process.stdout.write('\n'); resolve(); })
            .on('error', (err) => reject(err))
            .run();
    });
}
function formatBytes(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
}
