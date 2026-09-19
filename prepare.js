// Copies offline libs (PDF + OCR engine + English data) into www/lib
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'www', 'lib');
fs.mkdirSync(out, { recursive: true });
const cp = (src, dst) => { fs.copyFileSync(path.join(__dirname, 'node_modules', src), path.join(out, dst)); console.log('copied', dst); };
cp('jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js');
cp('tesseract.js/dist/tesseract.min.js', 'tesseract.min.js');
cp('tesseract.js/dist/worker.min.js', 'worker.min.js');
for (const f of fs.readdirSync(path.join(__dirname, 'node_modules/tesseract.js-core')))
  if (/^tesseract-core.*\.(js|wasm)$/.test(f)) cp('tesseract.js-core/' + f, f);
const dataDir = path.join(__dirname, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int');
const gz = fs.existsSync(dataDir) ? dataDir : path.join(__dirname, 'node_modules/@tesseract.js-data/eng/4.0.0');
fs.copyFileSync(path.join(gz, 'eng.traineddata.gz'), path.join(out, 'eng.traineddata.gz'));
console.log('copied eng.traineddata.gz from', gz);

// Embed the language data inside a .js file (Android's local server refuses to serve .gz files)
const b64 = fs.readFileSync(path.join(out, 'eng.traineddata.gz')).toString('base64');
fs.writeFileSync(path.join(out, 'eng-data.js'), 'window.ENG_GZ_B64="' + b64 + '";');
console.log('wrote eng-data.js');
