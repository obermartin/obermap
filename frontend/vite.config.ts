import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function mockPhpBackend() {
  return {
    name: 'mock-php-backend',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/api.php' || req.url === '/api.php/') {
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
