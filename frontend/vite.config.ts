import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https';
import mysql from 'mysql2/promise';

function mockPhpBackend() {
  let pool: mysql.Pool;
  return {
    name: 'mock-php-backend',
    configureServer(server: any) {
      pool = mysql.createPool({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: 'dbs15671316',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      pool.execute(`CREATE TABLE IF NOT EXISTS shows (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255),
        data LONGTEXT,
        updated_at DATETIME
      )`).catch(console.error);

      pool.execute(`CREATE TABLE IF NOT EXISTS weather_cache (
        id VARCHAR(255) PRIMARY KEY,
        data LONGTEXT,
        created_at DATETIME
      )`).catch(console.error);

      server.middlewares.use(async (req: any, res: any, next: any) => {
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

          if (action === 'migrate_to_sql') {
            res.setHeader('Content-Type', 'application/json');
            try {
              const showsDir = path.resolve(__dirname, 'public/shows');
              const cacheDir = path.resolve(__dirname, 'public/weather-cache');
              let migratedShows = 0;
              let migratedCache = 0;

              if (fs.existsSync(showsDir)) {
                const files = fs.readdirSync(showsDir).filter(f => f.endsWith('.json'));
                for (const f of files) {
                  const showId = f.replace('.json', '');
                  
                  const content = fs.readFileSync(path.join(showsDir, f), 'utf-8');
                  const stat = fs.statSync(path.join(showsDir, f));
                  let title = showId;
                  try {
                    const data = JSON.parse(content);
                    if (data?.settings?.title) title = data.settings.title;
                  } catch (e) {}
                  
                  const dateStr = new Date(stat.mtime).toISOString().slice(0, 19).replace('T', ' ');
                  await pool.execute('INSERT INTO shows (id, title, data, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data), updated_at=VALUES(updated_at)', [showId, title, content, dateStr]);
                  migratedShows++;
                }
              }

              if (fs.existsSync(cacheDir)) {
                const files = fs.readdirSync(cacheDir).filter(f => /^weather-wind_\d{6}-\d{6}\.json$/.test(f));
                for (const f of files) {
                  const content = fs.readFileSync(path.join(cacheDir, f), 'utf-8');
                  try {
                    const data = JSON.parse(content);
                    if (data.cacheId && data.createdAt) {
                      const dateStr = new Date(data.createdAt).toISOString().slice(0, 19).replace('T', ' ');
                      await pool.execute('INSERT INTO weather_cache (id, data, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [data.cacheId, content, dateStr]);
                      migratedCache++;
                    }
                  } catch (e) {}
                }
              }

              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, migrated_shows: migratedShows, migrated_cache: migratedCache }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
            return;
          }

          if (action === 'weather_wind_cache') {
            if (req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              try {
                if (urlObj.searchParams.get('list') === '1') {
                  const [rows]: any = await pool.query('SELECT id as cacheId, created_at as createdAt FROM weather_cache ORDER BY created_at ASC');
                  const snapshots = rows.map((r: any) => ({
                    cacheId: r.cacheId,
                    createdAt: new Date(r.createdAt).toISOString(),
                    path: `weather-cache/${r.cacheId}.json`
                  }));
                  res.statusCode = 200;
                  res.end(JSON.stringify({ snapshots }));
                  return;
                }

                const requestedCacheId = urlObj.searchParams.get('cacheId');
                let rows: any;
                if (requestedCacheId && /^[a-zA-Z0-9_-]+$/.test(requestedCacheId)) {
                  [rows] = await pool.query('SELECT data FROM weather_cache WHERE id = ?', [requestedCacheId]);
                } else {
                  [rows] = await pool.query('SELECT data FROM weather_cache ORDER BY created_at DESC LIMIT 1');
                }

                if (rows.length === 0) {
                  res.statusCode = 404;
                  res.end(JSON.stringify({ error: 'No weather wind cache available' }));
                  return;
                }

                res.statusCode = 200;
                res.end(rows[0].data);
              } catch (e: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
              return;
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => body += chunk.toString());
              req.on('end', async () => {
                try {
                  const decoded = JSON.parse(body);
                  if (!decoded.geojson) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing geojson payload' }));
                    return;
                  }

                  const now = new Date();
                  const stamp = now.toISOString().slice(2, 19).replace(/[-:T]/g, '').replace(/^(\d{6})(\d{6})$/, '$1-$2');
                  const cacheId = `weather-wind_${stamp}`;
                  const payload = {
                    cacheId,
                    createdAt: now.toISOString(),
                    geojson: decoded.geojson
                  };
                  const encoded = JSON.stringify(payload, null, 2);
                  const dateStr = now.toISOString().slice(0, 19).replace('T', ' ');

                  await pool.execute('INSERT INTO weather_cache (id, data, created_at) VALUES (?, ?, ?)', [cacheId, encoded, dateStr]);

                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, cacheId, path: `weather-cache/${cacheId}.json` }));
                } catch (e: any) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Invalid JSON payload or DB error: ' + e.message }));
                }
              });
              return;
            }
          }

          const show_id = urlObj.searchParams.get('show') || 'default';
          const safe_show_id = show_id.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';

          if (action === 'list_shows' && req.method === 'GET') {
            try {
              const [rows]: any = await pool.query('SELECT id, title, updated_at FROM shows ORDER BY updated_at DESC');
              const shows = rows.map((r: any) => ({
                id: r.id,
                title: r.title,
                updatedAt: new Date(r.updated_at).toISOString()
              }));
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify(shows));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
            return;
          }

          if (action === 'delete_show' && req.method === 'POST') {
             try {
               const [result]: any = await pool.execute('DELETE FROM shows WHERE id = ?', [safe_show_id]);
               res.setHeader('Content-Type', 'application/json');
               if (result.affectedRows > 0) {
                 res.statusCode = 200;
                 res.end(JSON.stringify({ success: true }));
               } else {
                 res.statusCode = 404;
                 res.end(JSON.stringify({ error: 'Not found' }));
               }
             } catch (e: any) {
               res.statusCode = 500;
               res.end(JSON.stringify({ error: e.message }));
             }
             return;
          }

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
            try {
              const [rows]: any = await pool.query('SELECT data FROM shows WHERE id = ?', [safe_show_id]);
              if (rows.length === 0) {
                const showsDir = path.resolve(__dirname, 'public/shows');
                const defaultPath = path.resolve(showsDir, '_DEFAULT.json');
                let initialData = JSON.stringify({ annotations: [], settings: null });
                if (fs.existsSync(defaultPath)) {
                  initialData = fs.readFileSync(defaultPath, 'utf-8');
                }
                const dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
                await pool.execute('INSERT INTO shows (id, title, data, updated_at) VALUES (?, ?, ?, ?)', [safe_show_id, safe_show_id, initialData, dateStr]);
                res.statusCode = 200;
                res.end(initialData);
              } else {
                res.statusCode = 200;
                res.end(rows[0].data);
              }
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => body += chunk.toString());
            req.on('end', async () => {
              try {
                const decoded = JSON.parse(body);
                
                // Differential Save Logic
                if (decoded.settings && decoded.settings.layers) {
                  const [rows]: any = await pool.query('SELECT data FROM shows WHERE id = ?', [safe_show_id]);
                  if (rows.length > 0) {
                    const existingData = JSON.parse(rows[0].data);
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
                }
                
                const title = decoded.settings?.title || safe_show_id;
                const encoded = JSON.stringify(decoded);
                const dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

                await pool.execute('INSERT INTO shows (id, title, data, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), data=VALUES(data), updated_at=VALUES(updated_at)', [safe_show_id, title, encoded, dateStr]);

                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON payload or DB error: ' + e.message }));
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