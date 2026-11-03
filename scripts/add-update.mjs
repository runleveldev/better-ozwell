// Adds (or replaces) a version in updates.json, the file Firefox reads via the
// manifest's update_url to find new versions of this self-distributed add-on.
// Usage: node scripts/add-update.mjs <version> <xpi-url> <sha256:hash>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [version, link, hash] = process.argv.slice(2);
if (!version || !link) {
  console.error('usage: add-update.mjs <version> <xpi-url> [sha256:hash]');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const id = manifest.browser_specific_settings.gecko.id;
const file = 'updates.json';
const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { addons: {} };
const entry = (data.addons[id] ??= { updates: [] });

entry.updates = entry.updates.filter(u => u.version !== version);
entry.updates.push({ version, update_link: link, ...(hash ? { update_hash: hash } : {}) });
entry.updates.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));

writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`updates.json: ${id} ${version}`);
