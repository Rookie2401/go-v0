import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const stageDir = process.cwd();
const nativeDir = path.join(stageDir, 'ios', 'App');
const sourceProject = path.join(nativeDir, 'App.xcodeproj');
const easProject = path.join(stageDir, 'ios', 'GoReview.xcodeproj');

// Expo's config tooling only discovers shared schemes in ios/*.xcodeproj. Keep
// Capacitor's normal ios/App project intact, and expose an equivalent root-level
// project for EAS scheme/credential discovery and the custom Gym invocation.
await rm(easProject, { recursive: true, force: true });
await cp(sourceProject, easProject, { recursive: true });

const pbxprojPath = path.join(easProject, 'project.pbxproj');
let pbxproj = await readFile(pbxprojPath, 'utf8');
pbxproj = pbxproj.replace('path = ../debug.xcconfig;', 'path = debug.xcconfig;');
pbxproj = pbxproj.replace('path = App;\n\t\t\tsourceTree = "<group>";', 'path = App/App;\n\t\t\tsourceTree = "<group>";');
pbxproj = pbxproj.replaceAll('INFOPLIST_FILE = App/Info.plist;', 'INFOPLIST_FILE = App/App/Info.plist;');
pbxproj = pbxproj.replace('relativePath = "CapApp-SPM";', 'relativePath = "App/CapApp-SPM";');
if (!pbxproj.includes('path = App/App;') || !pbxproj.includes('INFOPLIST_FILE = App/App/Info.plist;') || !pbxproj.includes('path = debug.xcconfig;') || !pbxproj.includes('relativePath = "App/CapApp-SPM";')) {
  throw new Error('Could not safely adjust the copied Xcode project paths for its ios/ root location.');
}
await writeFile(pbxprojPath, pbxproj);

const schemesDir = path.join(easProject, 'xcshareddata', 'xcschemes');
try {
  const { readdir } = await import('node:fs/promises');
  for (const file of await readdir(schemesDir)) {
    if (!file.endsWith('.xcscheme')) continue;
    const schemePath = path.join(schemesDir, file);
    const scheme = await readFile(schemePath, 'utf8');
    await writeFile(schemePath, scheme.replaceAll('container:App.xcodeproj', 'container:GoReview.xcodeproj'));
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  throw new Error(`Capacitor shared Xcode scheme directory is missing: ${schemesDir}`);
}

await mkdir(path.dirname(easProject), { recursive: true });
console.log('Prepared ios/GoReview.xcodeproj as the shared-scheme entry point for EAS.');
