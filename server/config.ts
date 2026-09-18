import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  // Number of reverse proxies in front of the server (so req.ip is the real client). Leave unset when not behind one.
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false,
  maxMediaBytes: Number(process.env.MAX_MEDIA_MB ?? 2048) * 1024 * 1024,
  // Origin the browser uses (the Vite dev server proxies /api to this server).
  // OAuth redirect URIs registered with each platform must be `${appUrl}/api/auth/<provider>/callback`.
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  // Public https origin of this server, only needed for Instagram (it downloads images from a URL).
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
  graphVersion: process.env.META_GRAPH_VERSION ?? 'v23.0',
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(here, 'data'),
  linkedinApiVersion: process.env.LINKEDIN_API_VERSION ?? '202601',
};

export const redirectUri = (provider: string) => `${config.appUrl}/api/auth/${provider}/callback`;
