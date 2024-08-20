const fs = require('node:fs');
const path = require('node:path');

function clearPackageJson() {
  const targetPath = path.resolve(__dirname, '../build');

  const json = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'),
  );
  delete json.private;
  delete json.scripts;
  delete json.devDependencies;
  fs.writeFileSync(
    path.resolve(targetPath, 'package.json'),
    JSON.stringify(json, undefined, 2),
  );
  fs.copyFileSync(
    path.resolve(targetPath, './types/index.d.ts'),
    path.resolve(targetPath, './types/index.d.cts'),
  );
}

clearPackageJson();
