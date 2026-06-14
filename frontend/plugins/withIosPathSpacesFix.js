const { withDangerousMod, withPodfile } = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");
const fs = require("fs");
const path = require("path");

const EXCONSTANTS_FIX_SNIPPET = `
    # Quote EXConstants script path when project directory contains spaces.
    installer.pods_project.targets.each do |target|
      next unless target.name == 'EXConstants'
      target.shell_script_build_phases.each do |phase|
        next unless phase.name&.include?('Generate app.config')
        phase.shell_script = phase.shell_script.gsub(
          'bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"',
          'bash -l -c "\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\""'
        )
      end
    end
`;

const BUNDLE_SCRIPT_OLD =
  '`\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\"`';

const BUNDLE_SCRIPT_NEW =
  'RN_XCODE_SCRIPT=$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\n/bin/sh \\"$RN_XCODE_SCRIPT\\"';

const PROJECT_ROOT_OLD = 'export PROJECT_ROOT=\\"$PROJECT_DIR\\"/..';
const PROJECT_ROOT_NEW =
  'export PROJECT_ROOT=\\"$(cd \\"$PROJECT_DIR/..\\" && pwd)\\"';

function patchXcodeProjectContents(contents) {
  let next = contents;

  if (next.includes(BUNDLE_SCRIPT_OLD)) {
    next = next.replace(BUNDLE_SCRIPT_OLD, BUNDLE_SCRIPT_NEW);
  }

  if (next.includes(PROJECT_ROOT_OLD)) {
    next = next.replace(PROJECT_ROOT_OLD, PROJECT_ROOT_NEW);
  }

  return next;
}

function withIosPathSpacesFix(config) {
  config = withPodfile(config, (config) => {
    const result = mergeContents({
      tag: "tandem-ios-path-spaces-fix",
      src: config.modResults.contents,
      newSrc: EXCONSTANTS_FIX_SNIPPET,
      anchor: /post_install do \|installer\|/,
      offset: 1,
      comment: "#",
    });

    if (result.didMerge || result.didClear) {
      config.modResults.contents = result.contents;
    }

    return config;
  });

  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const pbxprojPath = path.join(
        projectRoot,
        `${config.modRequest.projectName}.xcodeproj/project.pbxproj`
      );

      if (fs.existsSync(pbxprojPath)) {
        const contents = fs.readFileSync(pbxprojPath, "utf8");
        const patched = patchXcodeProjectContents(contents);
        if (patched !== contents) {
          fs.writeFileSync(pbxprojPath, patched);
        }
      }

      return config;
    },
  ]);
}

module.exports = withIosPathSpacesFix;
