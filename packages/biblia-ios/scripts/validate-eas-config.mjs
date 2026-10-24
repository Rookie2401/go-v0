import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const easJson = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8'));
const workflowText = await readFile(new URL('../.eas/build/ios-testflight.yml', import.meta.url), 'utf8');
const workflow = require('yaml').parse(workflowText);
const { EasJsonSchema } = require('@expo/eas-json/build/schema');
const easValidation = EasJsonSchema.validate(easJson, { abortEarly: false, allowUnknown: false });
if (easValidation.error) throw new Error(`Invalid eas.json: ${easValidation.error.message}`);

const nativeProject = await readFile(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
const targetId = nativeProject.match(/^\s*([A-F0-9]{24}) \/\* App \*\/ = \{\s*\n\s*isa = PBXNativeTarget;/m)?.[1];
if (!targetId) throw new Error('Could not find the native App target in project.pbxproj.');
const scheme = await readFile(new URL('../ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme', import.meta.url), 'utf8');
if (!scheme.includes(`BlueprintIdentifier="${targetId}"`) || !workflowText.includes('project("Biblia.xcodeproj")')) {
  throw new Error('The shared App scheme and Fastlane Gymfile template must target the EAS-discoverable project alias.');
}

const steps = workflow?.build?.steps;
if (!Array.isArray(steps) || workflow.build.name !== 'Biblia Capacitor iOS TestFlight') throw new Error('Custom iOS workflow is missing its build name or ordered steps.');
const stepNames = steps.map((step) => typeof step === 'string' ? step : step?.run ? `run:${step.run.name}` : Object.keys(step ?? {})[0]);
const required = ['eas/checkout', 'eas/install_node_modules', 'eas/resolve_build_config', 'eas/configure_ios_credentials', 'eas/generate_gymfile_from_template', 'eas/run_fastlane', 'eas/find_and_upload_build_artifacts'];
for (const name of required) if (!stepNames.includes(name)) throw new Error(`Custom workflow is missing required step ${name}.`);
if (stepNames.includes('eas/prebuild')) throw new Error('Capacitor workflow must not run Expo Prebuild over its existing Xcode project.');
if (!stepNames.some((name) => name === 'run:Expose the shared native project to EAS scheme discovery')) throw new Error('Custom workflow must expose its shared scheme at ios/*.xcodeproj after Capacitor sync.');
if (!stepNames.some((name) => name === 'run:Apply staged version to the existing Xcode project')) throw new Error('Custom workflow must set iOS version/build in both native project paths.');
if (easJson.build?.testflight?.ios?.image !== 'macos-tahoe-26.5-xcode-26.6' || easJson.build?.testflight?.node !== '24.11.1') {
  throw new Error('EAS profile must pin the documented Xcode 26.6 image and Node.js 24.11.1 override.');
}
// `--submit` additionally refuses the placeholder App Store Connect app id (only `eas submit` needs it; `eas build` does not).
if (process.argv.includes('--submit')) {
  const ascAppId = easJson.submit?.testflight?.ios?.ascAppId;
  if (!/^[0-9]{6,}$/.test(ascAppId ?? '')) {
    throw new Error('eas.json submit.testflight.ios.ascAppId is still a placeholder. Set it to the numeric Apple ID of the Biblia app record in App Store Connect before running `eas submit`.');
  }
} else if (!/^[0-9]{6,}$/.test(easJson.submit?.testflight?.ios?.ascAppId ?? '')) {
  console.warn('Note: eas.json ascAppId is still a placeholder. That is fine for `eas build`; set it before `eas submit` (npm run validate:submit-config checks it).');
}
console.log('EAS profile schema and custom Capacitor workflow structure are valid.');
