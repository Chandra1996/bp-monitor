// Adds camera permission to the generated Android manifest
const fs = require('fs');
const p = 'android/app/src/main/AndroidManifest.xml';
let x = fs.readFileSync(p, 'utf8');
if (!x.includes('android.permission.CAMERA')) {
  x = x.replace('</manifest>',
    '    <uses-permission android:name="android.permission.CAMERA" />\n' +
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
  fs.writeFileSync(p, x);
}
console.log('manifest patched');
