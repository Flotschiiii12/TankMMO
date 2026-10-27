import path from 'node:path';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const { game } = createApp({
  dbPath: process.env.DB_PATH ?? path.resolve('data/treadfront.db'),
  staticDir: process.env.STATIC_DIR ?? path.resolve('dist'),
  adminToken: process.env.ADMIN_TOKEN,
});
game.start();
game.listen(port).then((p) => console.log(`Treadfront server listening on :${p}`));
process.on('SIGTERM', () => game.close().then(() => process.exit(0)));
process.on('SIGINT', () => game.close().then(() => process.exit(0)));
