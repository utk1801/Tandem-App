const { withEntitlementsPlist } = require("@expo/config-plugins");

/** Strip push entitlements — free Apple IDs cannot use Push Notifications. */
module.exports = function withPersonalTeamIos(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
};
