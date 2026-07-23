const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const unzipper = require('unzipper');

const app = express();
app.use(cors());

// Serve static frontend files from the current directory (since server.js is in dist/nodejs-mongodb)
app.use(express.static(__dirname));
// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads and templates directories exist in the build output
const uploadsDir = path.join(__dirname, "uploads");
const templatesDir = path.join(__dirname, "label-templates");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
const upload = multer({ dest: "uploads/" });

// MongoDB setup
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const client = new MongoClient(mongoUri);
let db;
let showsCol;
let weatherCol;
let basemapsCol;

client.connect().then(() => {
  console.log("Connected to MongoDB successfully");
  db = client.db("obermap");
  showsCol = db.collection("shows");
  weatherCol = db.collection("weather_cache");
  basemapsCol = db.collection("basemaps");

  showsCol.createIndex({ id: 1 }, { unique: true }).catch(console.error);
  weatherCol.createIndex({ id: 1 }, { unique: true }).catch(console.error);
  basemapsCol.createIndex({ id: 1 }, { unique: true }).catch(console.error);
}).catch(err => {
  console.error("Failed to connect to MongoDB:", err);
});

// Middleware to intercept `/api.php` requests
app.use(async (req, res, next) => {
  // If it's not a request to api.php, pass it to the next middleware
  if (!req.path.endsWith('api.php') && !req.path.startsWith('/api/')) {
    return next();
  }

  // Parse query parameters
  const action = req.query.action;
  
  if (req.path.endsWith('api.php')) {
    if (action === "opensky") {
      const lamin = req.query.lamin || "";
      const lomin = req.query.lomin || "";
      const lamax = req.query.lamax || "";
      const lomax = req.query.lomax || "";
      const token = req.query.token || "";

      const targetUrl = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}&extended=1`;
      const options = { method: "GET", headers: {} };
      if (token) options.headers["Authorization"] = `Bearer ${token}`;

      const proxyReq = https.request(targetUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "opensky_track") {
      const icao24 = req.query.icao24 || "";
      const time = req.query.time || "0";
      const token = req.query.token || "";

      const targetUrl = `https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=${time}`;
      const options = { method: "GET", headers: {} };
      if (token) options.headers["Authorization"] = `Bearer ${token}`;

      const proxyReq = https.request(targetUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "opensky_metadata") {
      const icao24 = req.query.icao24 || "";
      const token = req.query.token || "";

      const targetUrl = `https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`;
      const options = { method: "GET", headers: {} };
      if (token) options.headers["Authorization"] = `Bearer ${token}`;

      const proxyReq = https.request(targetUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "opensky_route") {
      const callsign = req.query.callsign || "";
      const token = req.query.token || "";

      const targetUrl = `https://opensky-network.org/api/routes?callsign=${callsign}`;
      const options = { method: "GET", headers: {} };
      if (token) options.headers["Authorization"] = `Bearer ${token}`;

      const proxyReq = https.request(targetUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "opensky_token" && req.method === "POST") {
      const targetUrl = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
      const body = new URLSearchParams(req.body).toString();
      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      };
      const proxyReq = https.request(targetUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
      return;
    }

    if (action === "google_directions") {
      const origin = req.query.origin || "";
      const destination = req.query.destination || "";
      const key = req.query.key || "";

      const targetUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=transit&transit_mode=train&key=${key}`;
      const proxyReq = https.request(targetUrl, { method: "GET", headers: {} }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "deepstate_history") {
      const proxyReq = https.request("https://deepstatemap.live/api/history", { method: "GET", headers: {} }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "deepstate_geojson") {
      const id = req.query.id || "";
      const proxyReq = https.request(`https://deepstatemap.live/api/history/${id}/geojson`, { method: "GET", headers: {} }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "proxy_effis") {
      const targetUrl = req.query.url || "";
      if (!targetUrl.startsWith("https://maps.effis.emergency.copernicus.eu/")) {
        return res.status(400).json({ error: "Invalid url" });
      }
      const proxyReq = https.request(targetUrl, { method: "GET", headers: {} }, (proxyRes) => {
        if (proxyRes.statusCode !== 200) {
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
          return;
        }
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": proxyRes.headers["content-type"] || "image/png",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600"
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", () => {
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
      });
      proxyReq.end();
      return;
    }

    if (action === "proxy_gdacs") {
      const targetUrl = req.query.url || "";
      if (!targetUrl.startsWith("https://www.gdacs.org/")) {
        return res.status(400).json({ error: "Invalid url" });
      }
      const proxyReq = https.request(targetUrl, { 
        method: "GET", 
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        rejectUnauthorized: false
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type": proxyRes.headers["content-type"] || "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (e) => res.status(500).json({ error: e.message }));
      proxyReq.end();
      return;
    }

    if (action === "weather_wind_cache") {
      if (req.method === "GET") {
        try {
          if (req.query.list === "1") {
            const docs = await weatherCol.find({}, { projection: { id: 1, created_at: 1 } }).sort({ created_at: 1 }).toArray();
            const snapshots = docs.map((doc) => ({
              cacheId: doc.id,
              createdAt: new Date(doc.created_at).toISOString(),
              path: `weather-cache/${doc.id}.json`,
            }));
            return res.json({ snapshots });
          }

          const requestedCacheId = req.query.cacheId;
          let doc;
          if (requestedCacheId && /^[a-zA-Z0-9_-]+$/.test(requestedCacheId)) {
            doc = await weatherCol.findOne({ id: requestedCacheId });
          } else {
            const docs = await weatherCol.find({}).sort({ created_at: -1 }).limit(1).toArray();
            doc = docs[0];
          }

          if (!doc) return res.status(404).json({ error: "No weather wind cache available" });
          
          res.setHeader("Content-Type", "application/json");
          return res.send(doc.data);
        } catch (e) {
          return res.status(500).json({ error: e.message });
        }
      }

      if (req.method === "POST") {
        try {
          const decoded = req.body;
          if (!decoded.geojson) return res.status(400).json({ error: "Missing geojson payload" });

          const now = new Date();
          const stamp = now.toISOString().slice(2, 19).replace(/[-:T]/g, "").replace(/^(\d{6})(\d{6})$/, "$1-$2");
          const cacheId = `weather-wind_${stamp}`;
          const payload = {
            cacheId,
            createdAt: now.toISOString(),
            geojson: decoded.geojson,
          };
          const encoded = JSON.stringify(payload, null, 2);

          await weatherCol.updateOne(
            { id: cacheId },
            { $set: { id: cacheId, data: encoded, created_at: now } },
            { upsert: true },
          );

          return res.json({ success: true, cacheId, path: `weather-cache/${cacheId}.json` });
        } catch (e) {
          return res.status(400).json({ error: "DB error: " + e.message });
        }
      }
    }

    if (action === "list_basemaps" && req.method === "GET") {
      try {
        const docs = await basemapsCol.find({}).toArray();
        return res.json(docs);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (action === "basemap_style" && req.method === "GET") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Missing id" });
      try {
        const doc = await basemapsCol.findOne({ id });
        if (doc && doc.styleData) {
          res.setHeader("Content-Type", "application/json");
          return res.send(doc.styleData);
        } else {
          return res.status(404).json({ error: "Not found or no style data" });
        }
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (action === "delete_basemap" && req.method === "POST") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Missing id" });
      try {
        const result = await basemapsCol.deleteOne({ id });
        if (result.deletedCount && result.deletedCount > 0) {
          return res.json({ success: true });
        } else {
          return res.status(404).json({ error: "Not found" });
        }
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (action === "save_basemap" && req.method === "POST") {
      try {
        const decoded = req.body;
        if (!decoded.id || !decoded.url) return res.status(400).json({ error: "Missing id or url" });

        await basemapsCol.updateOne(
          { id: decoded.id },
          {
            $set: {
              id: decoded.id,
              name: decoded.name || decoded.id,
              url: decoded.url,
              styleData: decoded.styleData || null,
              previewData: decoded.previewData || null,
              updated_at: new Date()
            }
          },
          { upsert: true }
        );
        return res.json({ success: true });
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON or DB error: " + e.message });
      }
    }

    const show_id = req.query.show || "";

    if (action === "list_shows" && req.method === "GET") {
      try {
        const docs = await showsCol.find({}, { projection: { id: 1, title: 1, updated_at: 1, data: 1 } }).sort({ updated_at: -1 }).toArray();
        const shows = docs.map((doc) => {
          let parsed = { settings: { isTemplate: false, previewData: null } };
          try {
            if (doc.data) parsed = JSON.parse(doc.data);
          } catch (e) {}
          
          return {
            id: doc.id,
            title: doc.title,
            isTemplate: parsed.settings?.isTemplate || false,
            previewData: parsed.settings?.previewData || null,
            updatedAt: new Date(doc.updated_at).toISOString(),
          };
        });
        return res.json(shows);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (action === "delete_show" && req.method === "POST") {
      try {
        const result = await showsCol.deleteOne({ id: show_id });
        if (result.deletedCount && result.deletedCount > 0) {
          return res.json({ success: true });
        } else {
          return res.status(404).json({ error: "Not found" });
        }
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (!show_id || !/^[a-zA-Z0-9_-]+$/.test(show_id)) {
      if (!action) return res.status(400).json({ error: "Missing or invalid show ID" });
      return next(); // If action handled above, shouldn't reach here. If no action, require show_id
    }

    const safe_show_id = show_id;

    if (req.method === "GET") {
      try {
        const doc = await showsCol.findOne({ id: safe_show_id });
        if (!doc) {
          let initialData = JSON.stringify({ annotations: [], settings: null });
          if (safe_show_id !== "_DEFAULT") {
            const defDoc = await showsCol.findOne({ id: "_DEFAULT" });
            if (defDoc) initialData = defDoc.data;
          }
          const now = new Date();
          await showsCol.updateOne(
            { id: safe_show_id },
            { $set: { id: safe_show_id, title: safe_show_id, data: initialData, updated_at: now } },
            { upsert: true }
          );
          res.setHeader("Content-Type", "application/json");
          return res.send(initialData);
        } else {
          res.setHeader("Content-Type", "application/json");
          return res.send(doc.data);
        }
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (req.method === "POST") {
      try {
        const decoded = req.body;

        // Differential Save Logic
        if (decoded.settings && decoded.settings.layers) {
          const doc = await showsCol.findOne({ id: safe_show_id });
          if (doc) {
            const existingData = JSON.parse(doc.data);
            if (existingData.settings && existingData.settings.layers) {
              const existingLayers = {};
              existingData.settings.layers.forEach((l) => { if (l.id) existingLayers[l.id] = l; });

              decoded.settings.layers.forEach((l) => {
                if (l._keepExistingData === true) {
                  if (l.id && existingLayers[l.id] && existingLayers[l.id].data) {
                    l.data = existingLayers[l.id].data;
                  }
                  delete l._keepExistingData;
                }
                if (l._isDirty !== undefined) delete l._isDirty;
              });
            }
          }
        }

        const title = decoded.settings?.title || safe_show_id;
        const encoded = JSON.stringify(decoded);
        const now = new Date();

        await showsCol.updateOne(
          { id: safe_show_id },
          { $set: { id: safe_show_id, title, data: encoded, updated_at: now } },
          { upsert: true }
        );

        return res.json({ success: true });
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON payload or DB error: " + e.message });
      }
    }
  }

  // Handle other api endpoints
  if (req.path === '/api/templates' && req.method === "GET") {
    try {
      if (!fs.existsSync(templatesDir)) return res.json([]);
      const templates = fs.readdirSync(templatesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => {
          const id = dirent.name;
          let kind = "regular";
          let fullManifest = null;
          try {
            const manifestStr = fs.readFileSync(path.join(templatesDir, id, "manifest.json"), "utf8");
            fullManifest = JSON.parse(manifestStr);
            if (fullManifest.kind) kind = fullManifest.kind;
          } catch (e) {}
          return { id, kind, manifest: fullManifest };
        });
      return res.json(templates);
    } catch (error) {
      return res.status(500).json({ error: "Failed to list templates" });
    }
  }

  next();
});

app.post("/api/upload-template", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const templateName = path.basename(req.file.originalname, ".zip");
    const targetDir = path.join(templatesDir, templateName);

    await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: targetDir })).promise();
    fs.unlinkSync(req.file.path);

    const macosxPath = path.join(targetDir, "__MACOSX");
    if (fs.existsSync(macosxPath)) fs.rmSync(macosxPath, { recursive: true, force: true });

    const contents = fs.readdirSync(targetDir);
    if (contents.length === 1 && fs.statSync(path.join(targetDir, contents[0])).isDirectory()) {
      const innerDir = path.join(targetDir, contents[0]);
      const innerContents = fs.readdirSync(innerDir);
      for (const file of innerContents) {
        fs.renameSync(path.join(innerDir, file), path.join(targetDir, file));
      }
      fs.rmdirSync(innerDir);
    }

    res.json({ success: true, name: templateName });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Failed to extract template" });
  }
});

app.post("/api/upload-media", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

app.get("/api/check-embed", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json({ embeddable: false });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(targetUrl, { 
      method: 'GET',
      headers: { 'Range': 'bytes=0-1024' },
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    const xFrameOptions = response.headers.get('x-frame-options');
    const csp = response.headers.get('content-security-policy');
    
    let embeddable = true;
    if (xFrameOptions) {
      const val = xFrameOptions.toLowerCase();
      if (val.includes('deny') || val.includes('sameorigin')) embeddable = false;
    }
    if (csp) {
      const val = csp.toLowerCase();
      if (val.includes('frame-ancestors') && !val.includes('frame-ancestors *')) embeddable = false;
    }
    res.json({ embeddable });
  } catch (err) {
    res.json({ embeddable: false });
  }
});

// For any other request, send index.html (SPA routing fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
