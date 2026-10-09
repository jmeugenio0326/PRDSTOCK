const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const output = path.join(root, 'dist');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of ['index.html', 'css', 'js']) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), {
    recursive: true,
  });
}
