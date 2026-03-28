export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",

  extensionsToTreatAsEsm: [".ts"],

  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",

    // fixes .js imports pointing to .ts files
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },

  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true
      }
    ]
  },

  testPathIgnorePatterns: ["<rootDir>/dist/"]
};