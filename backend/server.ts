import { createApi } from './sqlite';

const host = process.env.MERSAL_API_HOST ?? '127.0.0.1';
const port = Number(process.env.MERSAL_API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MERSAL_API_PORT must be between 1 and 65535.');
const { app, close } = createApi(process.env.MERSAL_API_DB ?? 'backend/data/studio.sqlite');
const server = app.listen(port, host, () => console.log(`Mersal API listening at http://${host}:${port}/api/v1`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close(() => close()));
