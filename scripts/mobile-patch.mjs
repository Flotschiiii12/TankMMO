// Run after `npx cap add ios|android` (npm run mobile:add:ios / mobile:add:android). Idempotent.
// Locks the apps to landscape and hides system bars; Capacitor has no config switch for this.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const patch = (file, fn) => {
  if (!existsSync(file)) return console.log(`skip ${file} (platform not added)`);
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) return console.log(`ok   ${file} (already patched)`);
  writeFileSync(file, after);
  console.log(`done ${file}`);
};

// Android: sensorLandscape on the main activity, fullscreen theme flag.
patch('android/app/src/main/AndroidManifest.xml', (s) => {
  if (s.includes('android:screenOrientation')) return s;
  return s.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
});

// iOS: landscape only (iPhone and iPad), status bar hidden.
patch('ios/App/App/Info.plist', (s) => {
  const landscape = '<array>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>';
  let out = s.replace(/(<key>UISupportedInterfaceOrientations(?:~ipad)?<\/key>\s*)<array>[\s\S]*?<\/array>/g, `$1${landscape}`);
  if (!out.includes('UIStatusBarHidden')) out = out.replace(/<\/dict>\s*<\/plist>/, '\t<key>UIStatusBarHidden</key>\n\t<true/>\n\t<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<false/>\n</dict>\n</plist>');
  return out;
});
