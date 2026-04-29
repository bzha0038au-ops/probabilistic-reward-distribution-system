const fs = require("node:fs");
const path = require("node:path");

const baseConfig = require("./app.json");

const clone = (value) => JSON.parse(JSON.stringify(value));

const resolveConfiguredProjectId = () => {
  const value =
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID?.trim() ||
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
    "";

  return value || null;
};

module.exports = () => {
  const expoConfig = clone(baseConfig.expo);
  const projectId = resolveConfiguredProjectId();
  const googleServicesFilePath = path.join(__dirname, "google-services.json");

  expoConfig.owner = expoConfig.owner || "bill-cheung";

  if (projectId) {
    expoConfig.extra = {
      ...(expoConfig.extra ?? {}),
      eas: {
        ...(expoConfig.extra?.eas ?? {}),
        projectId,
      },
    };
  }

  if (fs.existsSync(googleServicesFilePath)) {
    expoConfig.android = {
      ...(expoConfig.android ?? {}),
      googleServicesFile: "./google-services.json",
    };
  }

  return {
    expo: expoConfig,
  };
};
