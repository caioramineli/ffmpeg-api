"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const compress_1 = require("./compress");
const app = (0, express_1.default)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
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
        const file = req.file ?? req.files?.[0];
        if (!file) {
            res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            return;
        }
        const filename = req.body.filename || file.originalname || 'video.mp4';
        const bucket = process.env.R2_BUCKET_NAME;
        console.log(`[ffmpeg-service] Recebido: ${filename} (${file.size} bytes)`);
        const result = await (0, compress_1.compressAndUpload)(file.buffer, filename, bucket);
        const publicUrl = process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL}/${result.key}` : undefined;
        console.log(`[ffmpeg-service] Concluído: ${result.key}`);
        res.json({
            key: result.key,
            url: publicUrl,
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            reductionPercent: result.reductionPercent,
        });
    }
    catch (err) {
        console.error('[ffmpeg-service] Erro:', err);
        res.status(500).json({ error: 'Falha ao comprimir ou fazer upload do vídeo.' });
    }
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`ffmpeg-service rodando na porta ${PORT}`);
});
