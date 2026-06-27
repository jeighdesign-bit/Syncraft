const fs = require('fs');
const path = require('path');

const assets = [
  '2222.jpg',
  'auth-hero.png',
  'brand logos',
  'gcash-verify.jfif'
];

const destDir = path.join(__dirname, 'dist');

async function copyAssets() {
  try {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    for (const asset of assets) {
      const srcPath = path.join(__dirname, asset);
      const destPath = path.join(destDir, asset);

      if (fs.existsSync(srcPath)) {
        console.log(`Copying ${asset} -> dist/${asset}...`);
        fs.cpSync(srcPath, destPath, { recursive: true, force: true });
      } else {
        console.warn(`Warning: Asset ${asset} not found at root.`);
      }
    }
    console.log('All static assets copied to dist/ successfully!');
  } catch (err) {
    console.error('Failed to copy assets:', err);
    process.exit(1);
  }
}

copyAssets();
