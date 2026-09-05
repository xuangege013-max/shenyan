const fs = require('fs');
const path = require('path');
const manifestPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let xml = fs.readFileSync(manifestPath, 'utf8');
if (!xml.includes('xmlns:tools')) {
  xml = xml.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ');
}
const perms = [
  ['android.permission.INTERNET', ''],
  ['android.permission.RECORD_AUDIO', ''],
  ['android.permission.PACKAGE_USAGE_STATS', ' tools:ignore="ProtectedPermissions"'],
  ['android.permission.QUERY_ALL_PACKAGES', ''],
];
for (const [p, extra] of perms) {
  if (!xml.includes(`android:name="${p}"`)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}"${extra}/>\n</manifest>`);
  }
}
if (!xml.includes('usesCleartextTraffic')) {
  xml = xml.replace('<application', '<application android:usesCleartextTraffic="true"');
}
fs.writeFileSync(manifestPath, xml);
console.log('Manifest patched OK');
