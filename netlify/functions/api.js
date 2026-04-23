import serverless from 'serverless-http';
import app from '../../api/index.js';

// Netlify redirect: /api/* -> /.netlify/functions/api/:splat
// event.path arrives as the ORIGINAL path (e.g. /api/auth/google),
// which already matches Express routes — no basePath stripping needed.
export const handler = serverless(app);
