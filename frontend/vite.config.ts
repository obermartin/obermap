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

          if (action === 'google_directions') {
            const origin = urlObj.searchParams.get('origin') || '';
            const destination = urlObj.searchParams.get('destination') || '';
            const key = urlObj.searchParams.get('key') || '';
            
            const targetUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=transit&transit_mode=train&key=${key}`;
            const options: any = { method: 'GET', headers: {} };
            
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

          const show_id = urlObj.searchParams.get('show') || 'default';
          const safe_show_id = show_id.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
          const showsDir = path.resolve(__dirname, 'public/shows');
          if (!fs.existsSync(showsDir)) fs.mkdirSync(showsDir, { recursive: true });

          if (action === 'list_shows' && req.method === 'GET') {
            const files = fs.readdirSync(showsDir).filter((f: string) => f.endsWith('.json'));
            const shows = files.map((f: string) => {
              const showId = f.replace('.json', '');
              let title = showId;
              try {
                const content = fs.readFileSync(path.join(showsDir, f), 'utf-8');
                const data = JSON.parse(content);
                if (data?.settings?.title) {
                  title = data.settings.title;
                }
              } catch (e) {
                // Ignore parse errors
              }
              const stat = fs.statSync(path.join(showsDir, f));
              return { id: showId, title, updatedAt: stat.mtime.toISOString() };
            });
            shows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(shows));
            return;
          }

          if (action === 'delete_show' && req.method === 'POST') {
             const targetPath = path.resolve(showsDir, safe_show_id + '.json');
             res.setHeader('Content-Type', 'application/json');
             if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
             } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Not found' }));
             }
             return;
          }

          const dbPath = path.resolve(showsDir, safe_show_id + '.json');
          
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
            if (!fs.existsSync(dbPath)) {
              const defaultPath = path.resolve(showsDir, '_DEFAULT.json');
              if (fs.existsSync(defaultPath)) {
                fs.copyFileSync(defaultPath, dbPath);
              } else {
                fs.writeFileSync(dbPath, JSON.stringify({ annotations: [], settings: null }), 'utf-8');
              }
            }
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
                const decoded = JSON.parse(body);
                
                // Differential Save Logic
                if (decoded.settings && decoded.settings.layers && fs.existsSync(dbPath)) {
                  const existingJson = fs.readFileSync(dbPath, 'utf-8');
                  const existingData = JSON.parse(existingJson);
                  if (existingData.settings && existingData.settings.layers) {
                    const existingLayers: any = {};
                    existingData.settings.layers.forEach((l: any) => {
                      if (l.id) existingLayers[l.id] = l;
                    });
                    
                    decoded.settings.layers.forEach((l: any) => {
                      if (l._keepExistingData === true) {
                        if (l.id && existingLayers[l.id] && existingLayers[l.id].data) {
                          l.data = existingLayers[l.id].data;
                        }
                        delete l._keepExistingData;
                      }
                      if (l._isDirty !== undefined) {
                        delete l._isDirty;
                      }
                    });
                  }
                }
                
                fs.writeFileSync(dbPath, JSON.stringify(decoded), 'utf-8');
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
