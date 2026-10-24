import { readFile, writeFile } from 'node:fs/promises';

const app = JSON.parse(await readFile('app.json', 'utf8'));
const buildNumber = app?.expo?.ios?.buildNumber;
const marketingVersion = app?.expo?.version;
if (!/^[1-9][0-9]*$/.test(buildNumber ?? '')) throw new Error('Staged iOS build number must be a positive integer.');
if (!/^\d+\.\d+(?:\.\d+)?$/.test(marketingVersion ?? '')) throw new Error('Staged marketing version must look like 1.0 or 1.0.1.');
for (const projectPath of ['ios/App/App.xcodeproj/project.pbxproj', 'ios/Biblia.xcodeproj/project.pbxproj']) {
  let project = await readFile(projectPath, 'utf8');
  for (const [setting, value] of [['CURRENT_PROJECT_VERSION', buildNumber], ['MARKETING_VERSION', marketingVersion]]) {
    const pattern = new RegExp(`(^\\s*${setting}\\s*=\\s*)[^;]*(;)`, 'gm');
    let matches = 0;
    project = project.replace(pattern, (_match, prefix, suffix) => { matches++; return `${prefix}${value}${suffix}`; });
    if (matches < 2) throw new Error(`Expected Debug and Release ${setting} values in ${projectPath}; found ${matches}.`);
  }
  await writeFile(projectPath, project);
}
