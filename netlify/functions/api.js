import serverless from 'serverless-http';
import appModule from '../../api/index.js';

// Netlify redirect: /api/* -> /.netlify/functions/api/:splat
// Ensure esbuild CommonJS/ESM interop doesn't pass the Module object instead of the Express app
const app = appModule.default || appModule;

export const handler = serverless(app);
