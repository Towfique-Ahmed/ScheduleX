import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  // Origin the browser uses (the Vite dev server proxies /api to this server).
  // OAuth redirect URIs registered with each platform must be `${appUrl}/api/auth/<provider>/callback`.
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(here, 'data'),
  linkedinApiVersion: process.env.LINKEDIN_API_VERSION ?? '202601',
};

export const redirectUri = (provider: string) => `${config.appUrl}/api/auth/${provider}/callback`;
