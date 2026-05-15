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

const multer = require('multer');
const unzipper = require('unzipper');

const upload = multer({ dest: 'uploads/' });
const templatesDir = path.join(__dirname, '../frontend/public/label-templates');

app.get('/api/templates', (req, res) => {
  try {
    if (!fs.existsSync(templatesDir)) {
      return res.json([]);
    }
    const templates = fs.readdirSync(templatesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    res.json(templates);
  } catch (error) {
    console.error('Error reading templates:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

app.post('/api/upload-template', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    // Template name is the name of the zip file without extension
    const templateName = path.basename(req.file.originalname, '.zip');
    const targetDir = path.join(templatesDir, templateName);
    
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }
    
    // Extract the zip
    await fs.createReadStream(req.file.path)
      .pipe(unzipper.Extract({ path: targetDir }))
      .promise();
      
    // Clean up uploaded zip
    fs.unlinkSync(req.file.path);
    
    // macOS zips often contain a __MACOSX directory which breaks the single-directory check
    const macosxPath = path.join(targetDir, '__MACOSX');
    if (fs.existsSync(macosxPath)) {
      fs.rmSync(macosxPath, { recursive: true, force: true });
    }
    
    // Check if the extracted directory contains another directory with the same name
    // (Common when zipping a folder on Mac/Windows)
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
    console.error('Error extracting template:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to extract template' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
