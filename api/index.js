// Vercel serverless entry — all /api/* requests are rewritten here (see vercel.json).
// The Express app keeps its own /api/... route prefixes, so req.url passes through as-is.
import app from '../server/src/app.js';

export default app;
