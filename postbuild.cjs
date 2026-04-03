const fs = require('node:fs');
const path = require('node:path');

function postBuild() {
  const projectRoot = process.cwd();
  const json = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
  );

  const buildDir = path.join(projectRoot, 'build');
  if (!fs.existsSync(buildDir)) throw new Error('Build directory not found');

  json.type = 'module';
  delete json.private;
  delete json.scripts;
  delete json.devDependencies;

  fs.writeFileSync(
    path.resolve(buildDir, 'package.json'),
    JSON.stringify(json, undefined, 2),
    'utf-8',
  );
  fs.copyFileSync(
    path.resolve('./README.md'),
    path.resolve(buildDir, 'README.md'),
  );
  fs.copyFileSync(
    path.resolve('./CHANGELOG.md'),
    path.resolve(buildDir, 'CHANGELOG.md'),
  );
  fs.copyFileSync(path.resolve('./LICENSE'), path.resolve(buildDir, 'LICENSE'));

  /** Update version */
  const constantsFile = path.resolve(buildDir, 'constants.js');
  if (fs.existsSync(constantsFile)) {
    let content = fs.readFileSync(constantsFile, 'utf8');
    content = content.replace(`version = '1'`, `version = '${json.version}'`);
    fs.writeFileSync(constantsFile, content, 'utf-8');
  }
}

postBuild();
