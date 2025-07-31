import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint‑plugin‑react";
import eslintConfigPrettier from "eslint‑config‑prettier/flat";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"],
  eslintConfigPrettier,

  // ─────────── 追加で functions ディレクトリ向け設定 ───────────
  {
    files: ["functions/**/*.js", "functions/**/*.ts", "functions-ai/**/*.js", "functions-ai/**/*.ts"],
    // Node.js 環境用 CommonJS
    languageOptions: {
      sourceType: "module", 
      globals: { module: "readonly", process: "readonly" }
    },
    // TypeScript parser を使用
    parser: "@typescript-eslint/parser",
    parserOptions: {
      project: ["functions/tsconfig.json", "functions-ai/tsconfig.json"],
      sourceType: "module",
      ecmaVersion: "latest"
    },
    rules: {
      // unused vars を無効化
      "@typescript-eslint/no-unused-vars": "off",
      // module定義のエラー回避
      "no-undef": "off"
    }
  },

  {
    settings: { react: { version: "detect" } },
    ignores: ["**/dist/**", "**/node_modules/**"]
  }
);
