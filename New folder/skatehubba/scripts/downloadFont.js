const fs = require('fs');
const https = require('https');
const path = require('path');

// Create fonts directory if it doesn't exist
const fontsDir = path.join(__dirname, '..', 'assets', 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// Download Press Start 2P font
const fontUrl = 'https://fonts.google.com/download?family=Press+Start+2P';
const fontPath = path.join(fontsDir, 'PressStart2P-Regular.ttf');

console.log('Downloading Press Start 2P font...');

https.get(fontUrl, (response) => {
  if (response.statusCode === 200) {
    const file = fs.createWriteStream(fontPath);
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Font downloaded successfully!');
    });
  } else {
    console.error('Failed to download font. Status code:', response.statusCode);
  }
}).on('error', (err) => {
  console.error('Error downloading font:', err.message);
});
