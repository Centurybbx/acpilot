import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { pathToFileURL } from 'node:url';

export async function startDaemon() {
  const config = loadConfig();
  const app = await createServer(config);
  app.log.info(
    'Device pairing enabled. Open /auth/state from the web app to bootstrap a trusted device.'
  );

  await app.listen({ host: config.host, port: config.port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startDaemon();
}
