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

module.exports = ({ config }) => ({
  ...config,
  expo: {
    ...appJson.expo,
    extra: {
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
    plugins: [...(appJson.expo.plugins || []), withIosPathSpacesFix],
  },
});
