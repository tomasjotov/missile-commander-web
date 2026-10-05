// Builds a static, server-ready version of the game into ./dist
// (no bundler needed). Upload the CONTENTS of dist/ to any folder on the
// web server, e.g. https://www.hrdinovefantasy.cz/demo/missile/
//
//   node build-dist.mjs      (or: npm run dist)
//
// Upload: index.html, .htaccess, lib/ and src/ (old dist/main.js and
// dist/phaser.min.js from earlier builds are no longer used).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');

// Files are overwritten on every build (the folder itself is kept).
fs.mkdirSync(dist, { recursive: true });

// Same layout as the project: index.html, lib/phaser.min.js, src/main.js.
// All paths are relative, so it runs from any folder on the server.
fs.mkdirSync(path.join(dist, 'lib'), { recursive: true });
fs.mkdirSync(path.join(dist, 'src'), { recursive: true });

// 1) Game code.
const code = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
fs.writeFileSync(path.join(dist, 'src', 'main.js'), code);
const version = (code.match(/'VERSION (\d+)'/) || [, Date.now()])[1];

// 2) Phaser library.
fs.copyFileSync(
    path.join(root, 'lib', 'phaser.min.js'),
    path.join(dist, 'lib', 'phaser.min.js')
);

// 3) index.html + version on the scripts (so browsers don't use an old copy).
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
    .replace('src="lib/phaser.min.js"', `src="lib/phaser.min.js?v=${version}"`)
    .replace('src="src/main.js"', `src="src/main.js?v=${version}"`);
fs.writeFileSync(path.join(dist, 'index.html'), html);

// 4) Apache settings: UTF-8, MIME types, caching.
// Everything is wrapped in <IfModule> so it never causes a 500 error;
// the game also works without this file.
fs.writeFileSync(path.join(dist, '.htaccess'), `# Missile Commander – optional Apache settings
<IfModule mod_mime.c>
    AddCharset UTF-8 .js .html
    AddType application/javascript .js
</IfModule>

<IfModule mod_headers.c>
    # Always fetch a fresh index.html; scripts are versioned (?v=...).
    <FilesMatch "\\.html$">
        Header set Cache-Control "no-cache"
    </FilesMatch>
    <FilesMatch "\\.js$">
        Header set Cache-Control "public, max-age=604800"
    </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html application/javascript
</IfModule>
`);

console.log(`dist/ built (version ${version}):`);
for (const f of ['index.html', '.htaccess', 'lib/phaser.min.js', 'src/main.js'])
    console.log('  ' + f.padEnd(20) + fs.statSync(path.join(dist, f)).size + ' B');
