const path = require("path");
const fs = require("fs");

function loadEnv(filePath) {
  if (fs.existsSync(filePath)) {
    require("dotenv").config({ path: filePath });
  }
}

// Share the repo-root .env with Expo (backend keys + optional frontend overrides).
loadEnv(path.resolve(__dirname, "../.env"));
loadEnv(path.resolve(__dirname, ".env"));

const appJson = require("./app.json");
const withIosPathSpacesFix = require("./plugins/withIosPathSpacesFix");
const withPersonalTeamIos = require("./plugins/withPersonalTeamIos");

const personalTeam = process.env.EXPO_PUBLIC_IOS_PERSONAL_TEAM === "1";

const basePlugins = (appJson.expo.plugins || []).filter((p) => {
  if (!personalTeam) return true;
  const name = Array.isArray(p) ? p[0] : p;
  return name !== "@react-native-firebase/messaging";
});

const plugins = [...basePlugins, withIosPathSpacesFix];
if (personalTeam) plugins.push(withPersonalTeamIos);

module.exports = ({ config }) => ({
  ...config,
  expo: {
    ...appJson.expo,
    extra: {
      eas: {
        projectId: "633ccb0b-c5b9-417f-a965-54dd7080cf13",
      },
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        "",
      backendUrl:
        process.env.EXPO_PUBLIC_BACKEND_URL ||
        process.env.BACKEND_URL ||
        "http://localhost:8000",
    },
    plugins,
  },
});
