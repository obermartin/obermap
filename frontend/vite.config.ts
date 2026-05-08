import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

import https from 'node:https';

function mockPhpBackend() {
  return {
    name: 'mock-php-backend',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const urlObj = new URL(req.url, 'http://localhost');
        if (urlObj.pathname === '/api.php') {
          const action = urlObj.searchParams.get('action');
          
          if (action === 'opensky') {
            const lamin = urlObj.searchParams.get('lamin') || '';
            const lomin = urlObj.searchParams.get('lomin') || '';
            const lamax = urlObj.searchParams.get('lamax') || '';
            const lomax = urlObj.searchParams.get('lomax') || '';
            const token = urlObj.searchParams.get('token') || '';
            
            const targetUrl = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}&extended=1`;
            const options: any = { method: 'GET', headers: {} };
            if (token) options.headers['Authorization'] = `Bearer ${token}`;
            
            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              proxyRes.pipe(res);
            });
            proxyReq.on('error', (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === 'opensky_track') {
            const icao24 = urlObj.searchParams.get('icao24') || '';
            const time = urlObj.searchParams.get('time') || '0';
            const token = urlObj.searchParams.get('token') || '';
            
            const targetUrl = `https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=${time}`;
            const options: any = { method: 'GET', headers: {} };
            if (token) options.headers['Authorization'] = `Bearer ${token}`;
            
            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              proxyRes.pipe(res);
            });
            proxyReq.on('error', (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }
          
          if (action === 'opensky_metadata') {
            const icao24 = urlObj.searchParams.get('icao24') || '';
            const token = urlObj.searchParams.get('token') || '';
            
            const targetUrl = `https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`;
            const options: any = { method: 'GET', headers: {} };
            if (token) options.headers['Authorization'] = `Bearer ${token}`;
            
            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              proxyRes.pipe(res);
            });
            proxyReq.on('error', (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === 'opensky_route') {
            const callsign = urlObj.searchParams.get('callsign') || '';
            const token = urlObj.searchParams.get('token') || '';
            
            const targetUrl = `https://opensky-network.org/api/routes?callsign=${callsign}`;
            const options: any = { method: 'GET', headers: {} };
            if (token) options.headers['Authorization'] = `Bearer ${token}`;
            
            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              proxyRes.pipe(res);
            });
            proxyReq.on('error', (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }
          
          if (action === 'opensky_token' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => body += chunk.toString());
            req.on('end', () => {
              const targetUrl = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
              const options = {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Content-Length': Buffer.byteLength(body)
                }
              };
              const proxyReq = https.request(targetUrl, options, (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                proxyRes.pipe(res);
              });
              proxyReq.on('error', (e) => {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              });
              proxyReq.write(body);
              proxyReq.end();
            });
            return;
          }

          const dbPath = path.resolve(__dirname, 'public/db.json');
          
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.statusCode = 200;
            res.end();
            return;
          }
          
          res.setHeader('Content-Type', 'application/json');
          
          if (req.method === 'GET') {
            if (fs.existsSync(dbPath)) {
              res.statusCode = 200;
              res.end(fs.readFileSync(dbPath, 'utf-8'));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ annotations: [], settings: null }));
            }
            return;
          }
          
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                JSON.parse(body);
                fs.writeFileSync(dbPath, body, 'utf-8');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
              }
            });
            return;
          }
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockPhpBackend()],
})
