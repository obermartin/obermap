const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Run Vite build
console.log('Running Vite build...');
// Instead of npm run build which might call us again, we call the specific commands
execSync('npx tsc -b && npx vite build', { stdio: 'inherit' });

// 2. Prepare paths
const rootDistDir = path.join(__dirname, 'dist');
const tempDistDir = path.join(__dirname, '.dist-temp');

// Rename dist to .dist-temp temporarily
if (fs.existsSync(rootDistDir)) {
  fs.renameSync(rootDistDir, tempDistDir);
}
fs.mkdirSync(rootDistDir);

// Replace obermapstudio.svg with obermapstudio_beta.svg in tempDistDir for production build
const betaSvgPath = path.join(tempDistDir, 'obermapstudio_beta.svg');
const targetSvgPath = path.join(tempDistDir, 'obermapstudio.svg');
if (fs.existsSync(betaSvgPath)) {
  fs.copyFileSync(betaSvgPath, targetSvgPath);
  console.log('Replaced obermapstudio.svg with obermapstudio_beta.svg for production dist build');
}

const phpDir = path.join(rootDistDir, 'php-mysql');
const nodeDir = path.join(rootDistDir, 'nodejs-mongodb');

// Copy tempDistDir to phpDir
fs.cpSync(tempDistDir, phpDir, { recursive: true });
// Copy tempDistDir to nodeDir
fs.cpSync(tempDistDir, nodeDir, { recursive: true });

// Cleanup .dist-temp
fs.rmSync(tempDistDir, { recursive: true, force: true });

console.log('Post-processing php-mysql package...');
// Modify phpDir
const phpMongoPath = path.join(phpDir, 'api_mongo.php');
if (fs.existsSync(phpMongoPath)) fs.unlinkSync(phpMongoPath);

console.log('Post-processing nodejs-mongodb package...');
// Modify nodeDir
const phpApi = path.join(nodeDir, 'api.php');
const phpApiMongo = path.join(nodeDir, 'api_mongo.php');
const phpDbConfig = path.join(nodeDir, 'db_config.php');
if (fs.existsSync(phpApi)) fs.unlinkSync(phpApi);
if (fs.existsSync(phpApiMongo)) fs.unlinkSync(phpApiMongo);
if (fs.existsSync(phpDbConfig)) fs.unlinkSync(phpDbConfig);

// Add server.js and package.json to nodeDir
const serverJsSource = path.join(__dirname, 'server.production.js');
if (fs.existsSync(serverJsSource)) {
  fs.copyFileSync(serverJsSource, path.join(nodeDir, 'server.js'));
} else {
  console.error("Warning: server.production.js not found!");
}

const packageJson = {
  name: "obermap-nodejs-backend",
  version: "1.0.0",
  main: "server.js",
  scripts: {
    start: "node server.js"
  },
  dependencies: {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "mongodb": "^6.3.0",
    "multer": "^1.4.5-lts.1",
    "unzipper": "^0.11.4"
  }
};
fs.writeFileSync(path.join(nodeDir, 'package.json'), JSON.stringify(packageJson, null, 2));

console.log('\n✅ Dual deployment packages created successfully!');
console.log('👉 PHP/MySQL Package: dist/php-mysql');
console.log('👉 Node.js/MongoDB Package: dist/nodejs-mongodb\n');
