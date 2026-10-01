// Sets CACHE_VERSION in service-worker.js to a hash of the precached files, so any
// asset change produces a new cache and installed apps pick up the update.
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workerPath = path.join(root, 'service-worker.js');
const VERSION_PATTERN = /const CACHE_VERSION = '([^']*)';/;

function precachedFiles(source) {
  const list = source.match(/const FILES_TO_CACHE = \[([\s\S]*?)\];/)[1];
  return [...list.matchAll(/'(\.\/[^']+)'/g)].map(match => match[1]);
}

function expectedVersion(source = readFileSync(workerPath, 'utf8')) {
  const hash = createHash('sha256');
  for (const file of precachedFiles(source)) {
    hash.update(file).update('\0').update(readFileSync(path.join(root, file))).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

function currentVersion(source = readFileSync(workerPath, 'utf8')) {
  return source.match(VERSION_PATTERN)[1];
}

if (require.main === module) {
  const source = readFileSync(workerPath, 'utf8');
  const version = expectedVersion(source);
  writeFileSync(workerPath, source.replace(VERSION_PATTERN, `const CACHE_VERSION = '${version}';`));
  console.log(`service-worker.js CACHE_VERSION = ${version}`);
}

module.exports = { precachedFiles, expectedVersion, currentVersion };
