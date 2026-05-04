const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'db.json');

// Initialize db.json if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ annotations: [], savedViews: [] }, null, 2));
} else {
  // Try to parse it to ensure it's valid, if not, reset it
  try {
    JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ annotations: [], savedViews: [] }, null, 2));
  }
}

app.get('/api/data', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    res.json(data);
  } catch (error) {
    console.error('Error reading db.json:', error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

app.post('/api/data', (req, res) => {
  try {
    const data = req.body;
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error writing to db.json:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
