import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["react"],
  rules: {
    "eslint/no-param-reassign": "error",
    "typescript/prefer-as-const": "error",
    "eslint/default-param-last": "error",
    "typescript/prefer-enum-initializers": "error",
    "react/self-closing-comp": "error",
    "eslint/one-var": ["error", "never"],
    "typescript/no-inferrable-types": "error",
    "eslint/no-else-return": "error",
  },
});
