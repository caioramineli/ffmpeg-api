"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadVideo = uploadVideo;
const form_data_1 = __importDefault(require("form-data"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const FFMPEG_SERVICE_URL = process.env.FFMPEG_SERVICE_URL || 'http://ffmpeg-service:3001';
/**
 * Envia um vídeo pro ffmpeg-service, que comprime e faz upload pro bucket.
 * Retorna key/url e métricas de compressão.
 *
 * @param videoBuffer - Buffer do vídeo recebido do usuário
 * @param filename    - Nome original do arquivo
 */
async function uploadVideo(videoBuffer, filename) {
    const form = new form_data_1.default();
    form.append('video', videoBuffer, {
        filename,
        contentType: 'video/mp4',
    });
    form.append('filename', filename);
    const response = await (0, node_fetch_1.default)(`${FFMPEG_SERVICE_URL}/compress`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`ffmpeg-service retornou erro ${response.status}: ${error}`);
    }
    const data = (await response.json());
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
//   const result = await uploadVideo(req.file.buffer, req.file.originalname);
//   console.log(`[media] Video comprimido: ${result.originalSize} -> ${result.compressedSize} bytes (${result.reductionPercent}%)`);
//   res.json(result);
// });
