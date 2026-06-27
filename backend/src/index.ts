import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import marketRouter from './routes/market.js';
import stockRouter from './routes/stock.js';
import moatRouter from './routes/moat.js';
import unusualFlowRouter from './routes/unusualFlow.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

const allowedOrigins = new Set(
  (process.env.FRONTEND_URL ?? 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean)
);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin)) cb(null, true);
    else cb(new Error(`CORS: origin not allowed — ${origin}`));
  },
}));
app.use(express.json());
app.use('/api', marketRouter);
app.use('/api', stockRouter);
app.use('/api', moatRouter);
app.use('/api', unusualFlowRouter);
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`[signal-dashboard backend] listening on :${PORT}`);
});
