const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withProviderFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure the application node exists
    if (!manifest.application || !Array.isArray(manifest.application)) {
      return config;
    }

    const application = manifest.application[0];

    // Ensure the tools namespace is added for merging
    manifest.$['xmlns:tools'] = 'http://android.com/tools';

    // List of providers to fix
    const providersToFix = [
      'androidx.startup.InitializationProvider',
      'com.google.firebase.provider.FirebaseInitProvider'
    ];

    if (application.provider && Array.isArray(application.provider)) {
      application.provider.forEach((provider) => {
        if (providersToFix.includes(provider.$['android:name'])) {
          provider.$['tools:node'] = 'merge';
          // Using a safer concatenation
          provider.$['android:authorities'] = '${applicationId}.' + provider.$['android:name'].split('.').pop().toLowerCase();
        }
      });
    }

    return config;
  });
};