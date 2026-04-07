import { nextJsConfig } from "@nodiox/config-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    ignores: [".next/**"],
  },
];
