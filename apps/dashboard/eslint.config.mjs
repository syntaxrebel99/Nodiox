import baseConfig from "@nodiox/config-eslint/next.mjs";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", ".turbo/**"],
  },
  ...baseConfig,
];
