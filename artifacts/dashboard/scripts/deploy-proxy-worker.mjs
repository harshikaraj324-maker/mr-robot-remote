#!/usr/bin/env node
// Deploys proxy frontend worker as "mr-robot"
// Service Binding: env.BACKEND → "mr-robot-live" (master admin backend, hidden)

import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { request as httpsRequest } from 'https';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CF_TOKEN = process.env.CF_TOKEN;
const CF_ACCOUNT = process.env.CF_ACCOUNT || process.env.CLOUDFLARE_ACCOUNT_ID;
const WORKER_NAME = process.env.PROXY_WORKER_NAME || 'mr-robot';
const BACKEND_WORKER = process.env.BACKEND_WORKER_NAME || 'mr-robot-live';

if (!CF_TOKEN || !CF_ACCOUNT) { console.error('Missing CF_TOKEN or CF_ACCOUNT'); process.exit(1); }

const workerScript = readFileSync(join(__dirname, '../dist/proxy-frontend-worker.mjs'), 'utf8');

const metadata = {
  main_module: 'worker.mjs',
  compatibility_date: '2024-12-01',
  compatibility_flags: ['nodejs_compat'],
  bindings: [
    { type: 'service', name: 'BACKEND', service: BACKEND_WORKER },
  ],
};

const boundary = '----ProxyBoundary' + randomBytes(8).toString('hex');
const parts = [];
parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n` + JSON.stringify(metadata) + '\r\n'));
parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="worker.mjs"; filename="worker.mjs"\r\nContent-Type: application/javascript+module\r\n\r\n`));
parts.push(Buffer.from(workerScript, 'utf8'));
parts.push(Buffer.from('\r\n'));
parts.push(Buffer.from(`--${boundary}--\r\n`));
const body = Buffer.concat(parts);

console.log(`Uploading "${WORKER_NAME}" (${Math.round(body.length/1024)}KB)...`);
console.log(`  Service Binding: env.BACKEND → "${BACKEND_WORKER}"`);

function api(path, method, body, headers) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: 'api.cloudflare.com', path, method, headers: { 'Authorization': `Bearer ${CF_TOKEN}`, ...headers } }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}

const up = await api(`/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/${WORKER_NAME}`, 'PUT', body,
  { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length });
if (!up.success) { console.error('Upload failed:', JSON.stringify(up.errors)); process.exit(1); }
console.log('Uploaded. etag:', up.result?.etag?.slice(0,8));

const sub = await api(`/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/${WORKER_NAME}/subdomain`, 'POST',
  Buffer.from(JSON.stringify({ enabled: true })), { 'Content-Type': 'application/json' });

const subdomain = 's39452363';
if (sub.success) {
  console.log(`\n✅ Sub-admin proxy deployed!`);
  console.log(`🌐 Sub-admin URL: https://${WORKER_NAME}.${subdomain}.workers.dev/d/<appId>`);
  console.log(`🔒 Backend (hidden): ${BACKEND_WORKER}.${subdomain}.workers.dev`);
  console.log(`🚫 Master admin blocked on proxy (/, /mr-professor, /api/master/*, /api/admin/*)`);
} else {
  console.warn('Subdomain warning:', JSON.stringify(sub.errors));
}
