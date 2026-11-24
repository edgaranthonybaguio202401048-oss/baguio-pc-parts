// Run after `npm run build`: fails if anything that looks like a provider key
// ended up in the browser bundle (S-12 / Lighthouse "no exposed secrets").
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  [/sk-[A-Za-z0-9]{20,}/, 'OpenAI/Maya secret key'],
  [/sk_(test|live)_[A-Za-z0-9]{10,}/, 'PayMongo secret key'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google/Gemini API key'],
  [/whsk_[A-Za-z0-9]{10,}/, 'PayMongo webhook secret'],
  [/JWT_SECRET|GEMINI_API_KEY|MAYA_SECRET_KEY/, 'server env variable name'],
];

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let found = 0;
for (const file of walk('dist').filter((f) => /\.(js|html|css|json|webmanifest)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of PATTERNS) {
    if (re.test(text)) { console.error(`✗ ${label} pattern found in ${file}`); found += 1; }
  }
}
if (found) process.exit(1);
console.log('✓ No secrets found in dist/');
