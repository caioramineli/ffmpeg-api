const express = require('express');
const { exec } = require('child_process');
const app = express();
app.use(express.json());

app.post('/compress', (req, res) => {
  const { input, output } = req.body;

  exec(`ffmpeg -i ${input} -vcodec libx264 -crf 28 ${output}`, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, output });
  });
});

app.listen(3000, () => console.log('FFmpeg API rodando na porta 3000'));
