// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt({
  rules: {
    "import/extensions": [
      "error",
      "always",
      {
        js: "always",
        jsx: "always",
        ts: "always",
        tsx: "always",
        vue: "always",
      },
    ],
  },
  ignores: ["/app/**/*.vue"],
});
