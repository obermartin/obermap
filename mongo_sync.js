const { MongoClient } = require('mongodb');

// Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'obermap';
const API_URL = process.env.API_URL || 'https://your-ionos-domain.com/api.php';

async function sync() {
  console.log('Connecting to MongoDB Atlas...');
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    const showsCol = db.collection('shows');
    const weatherCol = db.collection('weather_cache');
    const basemapsCol = db.collection('basemaps');

    console.log(`Fetching shows from IONOS API at ${API_URL}...`);
    const showsRes = await fetch(`${API_URL}?action=list_shows`);
    if (showsRes.ok) {
      const showsList = await showsRes.json();
      console.log(`Found ${showsList.length} shows. Syncing...`);
      for (const s of showsList) {
        console.log(`- Fetching show: ${s.id}`);
        const showRes = await fetch(`${API_URL}?show=${s.id}`);
        if (showRes.ok) {
          const content = await showRes.text();
          let title = s.id;
          try {
            const data = JSON.parse(content);
            if (data?.settings?.title) title = data.settings.title;
          } catch(e) {}

          await showsCol.updateOne(
            { id: s.id },
            {
              $set: {
                id: s.id,
                title: title,
                data: content,
                updated_at: new Date(s.updatedAt)
              }
            },
            { upsert: true }
          );
        }
      }
    }

    console.log(`Fetching weather caches from IONOS API...`);
    const weatherRes = await fetch(`${API_URL}?action=weather_wind_cache&list=1`);
    if (weatherRes.ok) {
      const { snapshots } = await weatherRes.json();
      console.log(`Found ${snapshots.length} weather snapshots. Syncing...`);
      for (const snap of snapshots) {
        console.log(`- Fetching snapshot: ${snap.cacheId}`);
        const snapRes = await fetch(`${API_URL}?action=weather_wind_cache&cacheId=${snap.cacheId}`);
        if (snapRes.ok) {
          const content = await snapRes.text();
          await weatherCol.updateOne(
            { id: snap.cacheId },
            {
              $set: {
                id: snap.cacheId,
                data: content,
                created_at: new Date(snap.createdAt)
              }
            },
            { upsert: true }
          );
        }
      }
    }

    console.log(`Fetching basemaps from IONOS API...`);
    const basemapsRes = await fetch(`${API_URL}?action=list_basemaps`);
    if (basemapsRes.ok) {
      const basemapsList = await basemapsRes.json();
      console.log(`Found ${basemapsList.length} basemaps. Syncing...`);
      for (const b of basemapsList) {
        await basemapsCol.updateOne(
          { id: b.id },
          { $set: b },
          { upsert: true }
        );
      }
    }

    console.log('Sync to MongoDB completed successfully!');
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    await client.close();
  }
}

sync();
