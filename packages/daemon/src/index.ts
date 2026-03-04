import { generateToken } from './auth/token.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { pathToFileURL } from 'node:url';

export async function startDaemon() {
  const config = loadConfig();
  const app = await createServer(config);
  const initialToken = generateToken(config.tokenSecret);

  app.log.info({ expiresAt: initialToken.expiresAt }, `Initial token: ${initialToken.token}`);

  await app.listen({ host: config.host, port: config.port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startDaemon();
}
