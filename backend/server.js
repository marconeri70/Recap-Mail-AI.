import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 8787;
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 }
});
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors({ origin: allowedOrigin }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File audio mancante.' });

  const diarize = req.body.diarize === 'true';
  const context = req.body.context || 'Trascrivi in italiano in modo fedele e chiaro.';
  const path = req.file.path;

  try {
    const params = {
      file: fs.createReadStream(path),
      model: diarize ? 'gpt-4o-transcribe-diarize' : 'gpt-4o-transcribe',
      response_format: diarize ? 'diarized_json' : 'text'
    };

    if (diarize) {
      params.chunking_strategy = 'auto';
    } else {
      params.prompt = context;
    }

    const result = await client.audio.transcriptions.create(params);

    if (typeof result === 'string') {
      return res.json({ text: result });
    }

    if (Array.isArray(result.segments)) {
      const text = result.segments
        .map(segment => `${segment.speaker ? `${segment.speaker}: ` : ''}${segment.text}`)
        .join('\n');
      return res.json({ text, segments: result.segments });
    }

    return res.json({ text: result.text || '', raw: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Trascrizione non riuscita.' });
  } finally {
    fs.unlink(path, () => {});
  }
});

app.listen(port, () => {
  console.log(`Recap Mail AI backend avviato su porta ${port}`);
});
