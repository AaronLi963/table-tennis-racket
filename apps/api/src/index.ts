import { createServer } from './server.ts';

const port = Number(process.env.PORT ?? 5179);
createServer().listen(port, () => {
  console.log(`[ttr-api] listening on http://localhost:${port}`);
});
