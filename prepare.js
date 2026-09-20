// Copies the PDF library into www/lib
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'www', 'lib');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'node_modules/jspdf/dist/jspdf.umd.min.js'), path.join(out, 'jspdf.umd.min.js'));
console.log('copied jspdf.umd.min.js');
