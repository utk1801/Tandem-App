const fs = require("fs");
const path = require("path");

const pbxprojPath = path.join(
  __dirname,
  "../ios/frontend.xcodeproj/project.pbxproj"
);

const BUNDLE_SCRIPT_OLD =
  '`\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\"`';

const BUNDLE_SCRIPT_NEW =
  'RN_XCODE_SCRIPT=$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\n/bin/sh \\"$RN_XCODE_SCRIPT\\"';

const PROJECT_ROOT_OLD = 'export PROJECT_ROOT=\\"$PROJECT_DIR\\"/..';
const PROJECT_ROOT_NEW =
  'export PROJECT_ROOT=\\"$(cd \\"$PROJECT_DIR/..\\" && pwd)\\"';

let contents = fs.readFileSync(pbxprojPath, "utf8");
const before = contents;

if (contents.includes(BUNDLE_SCRIPT_OLD)) {
  contents = contents.replace(BUNDLE_SCRIPT_OLD, BUNDLE_SCRIPT_NEW);
}

if (contents.includes(PROJECT_ROOT_OLD)) {
  contents = contents.replace(PROJECT_ROOT_OLD, PROJECT_ROOT_NEW);
}

if (contents === before) {
  console.error("No iOS bundle script changes were applied.");
  process.exit(1);
}

fs.writeFileSync(pbxprojPath, contents);
console.log("Patched iOS bundle script for paths with spaces.");
