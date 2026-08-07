import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { MongoClient } from "mongodb";

function mockPhpBackend(env: Record<string, string>) {
  let client: MongoClient | null = null;
  let db: any;
  let showsCol: any;
  let weatherCol: any;
  let basemapsCol: any;
  let isDbConnected = false;

  return {
    name: "mock-php-backend",
    configureServer(server: any) {
      const mongoUri = env.MONGO_URI || "mongodb://localhost:27017";
      client = new MongoClient(mongoUri);
      db = client.db("obermap");
      showsCol = db.collection("shows");
      weatherCol = db.collection("weather_cache");
      basemapsCol = db.collection("basemaps");

      client.connect().then(() => {
        isDbConnected = true;
        console.log("Connected to MongoDB Atlas successfully");
        showsCol.createIndex({ id: 1 }, { unique: true }).catch(console.error);
        weatherCol.createIndex({ id: 1 }, { unique: true }).catch(console.error);
        basemapsCol.createIndex({ id: 1 }, { unique: true }).catch(console.error);
      }).catch(err => {
        isDbConnected = false;
        console.error("Failed to connect to MongoDB, enabling local disk fallback:", err.message);
      });

      server.middlewares.use(async (req: any, res: any, next: any) => {
        const urlObj = new URL(req.url, "http://localhost");
        if (urlObj.pathname === "/api.php") {
          const action = urlObj.searchParams.get("action");

          if (action === "opensky") {
            const lamin = urlObj.searchParams.get("lamin") || "";
            const lomin = urlObj.searchParams.get("lomin") || "";
            const lamax = urlObj.searchParams.get("lamax") || "";
            const lomax = urlObj.searchParams.get("lomax") || "";
            const token = urlObj.searchParams.get("token") || "";

            const targetUrl = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}&extended=1`;
            const options: any = { method: "GET", headers: {} };
            if (token) options.headers["Authorization"] = `Bearer ${token}`;

            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            });
            proxyReq.on("error", (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === "opensky_track") {
            const icao24 = urlObj.searchParams.get("icao24") || "";
            const time = urlObj.searchParams.get("time") || "0";
            const token = urlObj.searchParams.get("token") || "";

            const targetUrl = `https://opensky-network.org/api/tracks/all?icao24=${icao24}&time=${time}`;
            const options: any = { method: "GET", headers: {} };
            if (token) options.headers["Authorization"] = `Bearer ${token}`;

            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            });
            proxyReq.on("error", (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === "opensky_metadata") {
            const icao24 = urlObj.searchParams.get("icao24") || "";
            const token = urlObj.searchParams.get("token") || "";

            const targetUrl = `https://opensky-network.org/api/metadata/aircraft/icao/${icao24}`;
            const options: any = { method: "GET", headers: {} };
            if (token) options.headers["Authorization"] = `Bearer ${token}`;

            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            });
            proxyReq.on("error", (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === "opensky_route") {
            const callsign = urlObj.searchParams.get("callsign") || "";
            const token = urlObj.searchParams.get("token") || "";

            const targetUrl = `https://opensky-network.org/api/routes?callsign=${callsign}`;
            const options: any = { method: "GET", headers: {} };
            if (token) options.headers["Authorization"] = `Bearer ${token}`;

            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            });
            proxyReq.on("error", (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === "opensky_token" && req.method === "POST") {
            let body = "";
            req.on("data", (chunk: any) => (body += chunk.toString()));
            req.on("end", () => {
              const targetUrl =
                "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
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
              proxyReq.on("error", (e) => {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              });
              proxyReq.write(body);
              proxyReq.end();
            });
            return;
          }

          if (action === "google_directions") {
            const origin = urlObj.searchParams.get("origin") || "";
            const destination = urlObj.searchParams.get("destination") || "";
            const key = urlObj.searchParams.get("key") || "";

            const targetUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=transit&transit_mode=train&key=${key}`;
            const options: any = { method: "GET", headers: {} };

            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            });
            proxyReq.on("error", (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === "deepstate_history") {
            const targetUrl = "https://deepstatemap.live/api/history";
            const options: any = { method: "GET", headers: {} };
            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            });
            proxyReq.on("error", (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === "deepstate_geojson") {
            const id = urlObj.searchParams.get("id") || "";
            const targetUrl = `https://deepstatemap.live/api/history/${id}/geojson`;
            const options: any = { method: "GET", headers: {} };
            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            });
            proxyReq.on("error", (e) => {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.end();
            return;
          }

          if (action === "proxy_effis") {
            const targetUrl = urlObj.searchParams.get("url") || "";
            if (!targetUrl.startsWith("https://maps.effis.emergency.copernicus.eu/")) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid url" }));
              return;
            }
            const options: any = { method: "GET", headers: {} };
            const proxyReq = https.request(targetUrl, options, (proxyRes) => {
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
            const targetUrl = urlObj.searchParams.get("url") || "";
            if (!targetUrl.startsWith("https://www.gdacs.org/") && !targetUrl.startsWith("https://gdacs.org/")) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid url" }));
              return;
            }
            try {
              const fetchRes = await fetch(targetUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                }
              });
              const buffer = await fetchRes.arrayBuffer();
              res.statusCode = fetchRes.status;
              res.setHeader("Content-Type", fetchRes.headers.get("content-type") || "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(Buffer.from(buffer));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
            return;
          }

          if (action === "migrate_to_sql" || action === "migrate_to_mongodb") {
            res.setHeader("Content-Type", "application/json");
            try {
              const showsDir = path.resolve(__dirname, "public/shows");
              const cacheDir = path.resolve(__dirname, "public/weather-cache");
              let migratedShows = 0;
              let migratedCache = 0;

              if (fs.existsSync(showsDir)) {
                const files = fs
                  .readdirSync(showsDir)
                  .filter((f) => f.endsWith(".json"));
                for (const f of files) {
                  const showId = f.replace(".json", "");

                  const content = fs.readFileSync(
                    path.join(showsDir, f),
                    "utf-8",
                  );
                  const stat = fs.statSync(path.join(showsDir, f));
                  let title = showId;
                  try {
                    const data = JSON.parse(content);
                    if (data?.settings?.title) title = data.settings.title;
                  } catch (e) {}

                  await showsCol.updateOne(
                    { id: showId },
                    {
                      $set: {
                        id: showId,
                        title,
                        data: content,
                        updated_at: stat.mtime,
                      },
                    },
                    { upsert: true },
                  );
                  migratedShows++;
                }
              }

              if (fs.existsSync(cacheDir)) {
                const files = fs
                  .readdirSync(cacheDir)
                  .filter((f) => /^weather-wind_\d{6}-\d{6}\.json$/.test(f));
                for (const f of files) {
                  const content = fs.readFileSync(
                    path.join(cacheDir, f),
                    "utf-8",
                  );
                  try {
                    const data = JSON.parse(content);
                    if (data.cacheId && data.createdAt) {
                      await weatherCol.updateOne(
                        { id: data.cacheId },
                        {
                          $set: {
                            id: data.cacheId,
                            data: content,
                            created_at: new Date(data.createdAt),
                          },
                        },
                        { upsert: true },
                      );
                      migratedCache++;
                    }
                  } catch (e) {}
                }
              }

              let mysqlMigratedShows = 0;
              let mysqlMigratedCache = 0;
              let mysqlError = null;

              try {
                const mysql = await import("mysql2/promise");
                const connection = await mysql.createConnection({
                  host: "localhost",
                  port: 3306,
                  user: "root",
                  password: "",
                  database: "dbs15671316",
                });

                const [showsRows]: any = await connection.execute("SELECT id, title, data, updated_at FROM shows");
                for (const row of showsRows) {
                  const mtime = row.updated_at ? new Date(row.updated_at) : new Date();
                  await showsCol.updateOne(
                    { id: row.id },
                    {
                      $set: {
                        id: row.id,
                        title: row.title,
                        data: row.data,
                        updated_at: mtime,
                      },
                    },
                    { upsert: true }
                  );
                  mysqlMigratedShows++;
                }

                const [cacheRows]: any = await connection.execute("SELECT id, data, created_at FROM weather_cache");
                for (const row of cacheRows) {
                  const ctime = row.created_at ? new Date(row.created_at) : new Date();
                  await weatherCol.updateOne(
                    { id: row.id },
                    {
                      $set: {
                        id: row.id,
                        data: row.data,
                        created_at: ctime,
                      },
                    },
                    { upsert: true }
                  );
                  mysqlMigratedCache++;
                }

                await connection.end();
              } catch (err: any) {
                console.error("MySQL migration error:", err);
                mysqlError = err.message;
              }

              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  success: true,
                  files_migrated: { shows: migratedShows, weather_cache: migratedCache },
                  mysql_migrated: { shows: mysqlMigratedShows, weather_cache: mysqlMigratedCache },
                  mysql_error: mysqlError,
                }),
              );
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
            return;
          }

          if (action === "weather_wind_cache") {
            if (req.method === "GET") {
              res.setHeader("Content-Type", "application/json");
              try {
                if (urlObj.searchParams.get("list") === "1") {
                  const docs = await weatherCol
                    .find({}, { projection: { id: 1, created_at: 1 } })
                    .sort({ created_at: 1 })
                    .toArray();
                  const snapshots = docs.map((doc: any) => ({
                    cacheId: doc.id,
                    createdAt: new Date(doc.created_at).toISOString(),
                    path: `weather-cache/${doc.id}.json`,
                  }));
                  res.statusCode = 200;
                  res.end(JSON.stringify({ snapshots }));
                  return;
                }

                const requestedCacheId = urlObj.searchParams.get("cacheId");
                let doc: any;
                if (
                  requestedCacheId &&
                  /^[a-zA-Z0-9_-]+$/.test(requestedCacheId)
                ) {
                  doc = await weatherCol.findOne({ id: requestedCacheId });
                } else {
                  const docs = await weatherCol
                    .find({})
                    .sort({ created_at: -1 })
                    .limit(1)
                    .toArray();
                  doc = docs[0];
                }

                if (!doc) {
                  res.statusCode = 404;
                  res.end(
                    JSON.stringify({
                      error: "No weather wind cache available",
                    }),
                  );
                  return;
                }

                res.statusCode = 200;
                res.end(doc.data);
              } catch (e: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
              return;
            }

            if (req.method === "POST") {
              let body = "";
              req.on("data", (chunk: any) => (body += chunk.toString()));
              req.on("end", async () => {
                try {
                  const decoded = JSON.parse(body);
                  if (!decoded.geojson) {
                    res.statusCode = 400;
                    res.end(
                      JSON.stringify({ error: "Missing geojson payload" }),
                    );
                    return;
                  }

                  const now = new Date();
                  const stamp = now
                    .toISOString()
                    .slice(2, 19)
                    .replace(/[-:T]/g, "")
                    .replace(/^(\d{6})(\d{6})$/, "$1-$2");
                  const cacheId = `weather-wind_${stamp}`;
                  const payload = {
                    cacheId,
                    createdAt: now.toISOString(),
                    geojson: decoded.geojson,
                  };
                  const encoded = JSON.stringify(payload, null, 2);

                  await weatherCol.updateOne(
                    { id: cacheId },
                    {
                      $set: {
                        id: cacheId,
                        data: encoded,
                        created_at: now,
                      },
                    },
                    { upsert: true },
                  );

                  res.statusCode = 200;
                  res.end(
                    JSON.stringify({
                      success: true,
                      cacheId,
                      path: `weather-cache/${cacheId}.json`,
                    }),
                  );
                } catch (e: any) {
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error: "Invalid JSON payload or DB error: " + e.message,
                    }),
                  );
                }
              });
              return;
            }
          }
          if (action === "list_basemaps" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            if (isDbConnected && basemapsCol) {
              try {
                const docs = await basemapsCol.find({}).toArray();
                res.statusCode = 200;
                res.end(JSON.stringify(docs));
                return;
              } catch (e) {
                console.warn("MongoDB list_basemaps failed, falling back to disk", e);
              }
            }

            try {
              const basemapsDir = path.resolve(__dirname, "public/basemaps");
              const basemaps: any[] = [];
              if (fs.existsSync(basemapsDir)) {
                const files = fs.readdirSync(basemapsDir).filter(f => f.endsWith(".json"));
                for (const f of files) {
                  try {
                    const content = fs.readFileSync(path.join(basemapsDir, f), "utf-8");
                    basemaps.push(JSON.parse(content));
                  } catch (e) {}
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify(basemaps));
            } catch (e: any) {
              res.statusCode = 200;
              res.end(JSON.stringify([]));
            }
            return;
          }

          if (action === "basemap_style" && req.method === "GET") {
            const id = urlObj.searchParams.get("id");
            res.setHeader("Content-Type", "application/json");
            if (!id) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing id" }));
              return;
            }
            if (isDbConnected && basemapsCol) {
              try {
                const doc = await basemapsCol.findOne({ id });
                if (doc && doc.styleData) {
                  res.statusCode = 200;
                  res.end(doc.styleData);
                  return;
                }
              } catch (e) {}
            }
            try {
              const filePath = path.resolve(__dirname, `public/basemaps/${id}.json`);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf-8");
                const parsed = JSON.parse(content);
                if (parsed.styleData) {
                  res.statusCode = 200;
                  res.end(parsed.styleData);
                  return;
                }
              }
            } catch (e) {}
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Not found or no style data" }));
            return;
          }

          if (action === "delete_basemap" && req.method === "POST") {
            const id = urlObj.searchParams.get("id");
            res.setHeader("Content-Type", "application/json");
            if (!id) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing id" }));
              return;
            }
            if (isDbConnected && basemapsCol) {
              try { await basemapsCol.deleteOne({ id }); } catch (e) {}
            }
            try {
              const filePath = path.resolve(__dirname, `public/basemaps/${id}.json`);
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (e) {}
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (action === "save_basemap" && req.method === "POST") {
            let body = "";
            req.on("data", (chunk: any) => (body += chunk.toString()));
            req.on("end", async () => {
              res.setHeader("Content-Type", "application/json");
              try {
                const decoded = JSON.parse(body);
                if (!decoded.id || !decoded.url) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Missing id or url" }));
                  return;
                }

                if (isDbConnected && basemapsCol) {
                  try {
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
                  } catch (e) {}
                }

                try {
                  const basemapsDir = path.resolve(__dirname, "public/basemaps");
                  if (!fs.existsSync(basemapsDir)) fs.mkdirSync(basemapsDir, { recursive: true });
                  fs.writeFileSync(path.join(basemapsDir, `${decoded.id}.json`), body, "utf-8");
                } catch (e) {}

                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Invalid JSON or DB error: " + e.message }));
              }
            });
            return;
          }
          const show_id = urlObj.searchParams.get("show") || "";

          if (action === "list_shows" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            if (isDbConnected && showsCol) {
              try {
                const docs = await showsCol
                  .find({}, { projection: { id: 1, title: 1, updated_at: 1, data: 1 } })
                  .sort({ updated_at: -1 })
                  .toArray();
                const shows = docs.map((doc: any) => {
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
                res.statusCode = 200;
                res.end(JSON.stringify(shows));
                return;
              } catch (e) {
                console.warn("MongoDB list_shows failed, falling back to disk", e);
              }
            }

            try {
              const showsDir = path.resolve(__dirname, "public/shows");
              const shows: any[] = [];
              if (fs.existsSync(showsDir)) {
                const files = fs.readdirSync(showsDir).filter(f => f.endsWith(".json"));
                for (const f of files) {
                  const id = f.replace(".json", "");
                  const stat = fs.statSync(path.join(showsDir, f));
                  const content = fs.readFileSync(path.join(showsDir, f), "utf-8");
                  let parsed = { settings: { title: id, isTemplate: false, previewData: null } };
                  try { parsed = JSON.parse(content); } catch (e) {}
                  shows.push({
                    id,
                    title: parsed.settings?.title || id,
                    isTemplate: parsed.settings?.isTemplate || false,
                    previewData: parsed.settings?.previewData || null,
                    updatedAt: stat.mtime.toISOString(),
                  });
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify(shows));
            } catch (e: any) {
              res.statusCode = 200;
              res.end(JSON.stringify([]));
            }
            return;
          }

          if (action === "delete_show" && req.method === "POST") {
            res.setHeader("Content-Type", "application/json");
            if (isDbConnected && showsCol) {
              try { await showsCol.deleteOne({ id: show_id }); } catch (e) {}
            }
            try {
              const filePath = path.resolve(__dirname, `public/shows/${show_id}.json`);
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (e) {}
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (req.method === "OPTIONS") {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            res.statusCode = 200;
            res.end();
            return;
          }

          if (!show_id || !/^[a-zA-Z0-9_-]+$/.test(show_id)) {
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing or invalid show ID" }));
            return;
          }

          const safe_show_id = show_id;

          res.setHeader("Content-Type", "application/json");

          if (req.method === "GET") {
            if (isDbConnected && showsCol) {
              try {
                const doc = await showsCol.findOne({ id: safe_show_id });
                if (doc) {
                  res.statusCode = 200;
                  res.end(doc.data);
                  return;
                }
              } catch (e) {
                console.warn("MongoDB get show failed, falling back to disk", e);
              }
            }

            try {
              const filePath = path.resolve(__dirname, `public/shows/${safe_show_id}.json`);
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf-8");
                res.statusCode = 200;
                res.end(content);
                return;
              }
            } catch (e) {}

            const initialData = JSON.stringify({ annotations: [], settings: null });
            res.statusCode = 200;
            res.end(initialData);
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk: any) => (body += chunk.toString()));
            req.on("end", async () => {
              res.setHeader("Content-Type", "application/json");
              try {
                const decoded = JSON.parse(body);

                if (isDbConnected && showsCol) {
                  try {
                    // Differential Save Logic
                    if (decoded.settings && decoded.settings.layers) {
                      const doc = await showsCol.findOne({ id: safe_show_id });
                      if (doc) {
                        const existingData = JSON.parse(doc.data);
                        if (existingData.settings && existingData.settings.layers) {
                          const existingLayers: any = {};
                          existingData.settings.layers.forEach((l: any) => {
                            if (l.id) existingLayers[l.id] = l;
                          });

                          decoded.settings.layers.forEach((l: any) => {
                            if (l._keepExistingData === true) {
                              if (
                                l.id &&
                                existingLayers[l.id] &&
                                existingLayers[l.id].data
                              ) {
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
                    const now = new Date();

                    await showsCol.updateOne(
                      { id: safe_show_id },
                      {
                        $set: {
                          id: safe_show_id,
                          title,
                          data: encoded,
                          updated_at: now,
                        },
                      },
                      { upsert: true },
                    );
                  } catch (e) {
                    console.warn("MongoDB update show failed, writing to disk", e);
                  }
                }

                // Always write to disk as fallback
                try {
                  const showsDir = path.resolve(__dirname, "public/shows");
                  if (!fs.existsSync(showsDir)) fs.mkdirSync(showsDir, { recursive: true });
                  fs.writeFileSync(path.join(showsDir, `${safe_show_id}.json`), body, "utf-8");
                } catch (e) {}

                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(
                  JSON.stringify({
                    error: "Invalid JSON payload: " + e.message,
                  }),
                );
              }
            });
            return;
          }
        }

        if (urlObj.pathname === "/api/templates" && req.method === "GET") {
          try {
            const templatesDir = path.resolve(
              __dirname,
              "public/label-templates",
            );
            if (!fs.existsSync(templatesDir)) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify([]));
              return;
            }
            const templates = fs
              .readdirSync(templatesDir, { withFileTypes: true })
              .filter((dirent) => dirent.isDirectory())
              .map((dirent) => {
                const id = dirent.name;
                let kind = "regular"; // fallback
                let fullManifest = null;
                try {
                  const manifestStr = fs.readFileSync(
                    path.join(templatesDir, id, "manifest.json"),
                    "utf8",
                  );
                  fullManifest = JSON.parse(manifestStr);
                  if (fullManifest.kind) {
                    kind = fullManifest.kind;
                  }
                } catch (e) {
                  // ignore
                }
                return { id, kind, manifest: fullManifest };
              });
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(templates));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        if (urlObj.pathname === "/api/upload-template") {
          const options = {
            hostname: "localhost",
            port: 3001,
            path: "/api/upload-template",
            method: req.method,
            headers: req.headers,
          };

          const http = require("node:http");
          const proxyReqHttp = http.request(options, (proxyRes: any) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
          });

          proxyReqHttp.on("error", () => {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                success: false,
                error:
                  "Upload requires running the Node backend on port 3001 (cd backend && node server.js). Connection refused.",
              }),
            );
          });

          req.pipe(proxyReqHttp);
          return;
        }

        if (urlObj.pathname.startsWith("/label-templates/")) {
          try {
            const filePath = path.join(__dirname, "public", decodeURIComponent(urlObj.pathname));
            if (fs.existsSync(filePath)) {
              const stat = fs.statSync(filePath);
              if (stat.isFile()) {
                const content = fs.readFileSync(filePath);
                const ext = path.extname(filePath);
                const mimeType = ext === ".json" ? "application/json" : ext === ".svg" ? "image/svg+xml" : "text/plain";
                res.setHeader("Content-Type", mimeType);
                res.statusCode = 200;
                res.end(content);
                return;
              }
            }
          } catch (e) {
            console.error(e);
          }
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), mockPhpBackend(env)],
  };
});
