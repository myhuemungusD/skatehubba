module.exports = {
  preset: "detox",
  testMatch: ["**/*.e2e.js"],
  setupFilesAfterEnv: ["<rootDir>/init.js"],
  testTimeout: 120000
};
