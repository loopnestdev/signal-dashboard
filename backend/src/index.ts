import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import marketRouter from './routes/market.js';
import stockRouter from './routes/stock.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', marketRouter);
app.use('/api', stockRouter);
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`[signal-dashboard backend] listening on :${PORT}`);
});
