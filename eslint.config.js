import { globalIgnores } from "eslint/config";
import js from "@eslint/js";
import react from "eslint-plugin-react";
import globals from "globals";

export default [
  globalIgnores(["dist/"]),           // ← dist フォルダを完全除外
  js.configs.recommended, // JavaScriptの基本ルール
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
    },
    rules: {
      "react/react-in-jsx-scope": "off",
    },
  },
];
