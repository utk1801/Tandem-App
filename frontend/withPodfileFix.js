const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withPodfileFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');

      // Add use_modular_headers! if not already present
      if (!podfileContent.includes('use_modular_headers!')) {
        podfileContent = podfileContent.replace(
          'platform :ios',
          'use_modular_headers!\nplatform :ios'
        );
        fs.writeFileSync(podfilePath, podfileContent);
      }
      return config;
    },
  ]);
};