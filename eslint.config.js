// eslint.config.js
const globals = require('globals');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');
const eslintPluginPrettier = require('eslint-plugin-prettier');

module.exports = tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/.tmp/**',
      '.history/**',
      '.agent/**',
      '.git/**',
      'packages/chrome/devtools/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.recommended, prettier],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { prettier: eslintPluginPrettier },
    rules: {
      'prettier/prettier': 'error',
      // CJS 配置文件（eslint.config.js / prettier.config.js）使用 require 是正常惯例
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended, tseslint.configs.recommendedTypeChecked, prettier],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        projectService: true, // lazy 类型感知，弃用 tsconfig.eslint.json
      },
    },
    plugins: { prettier: eslintPluginPrettier },
    rules: {
      'prettier/prettier': 'error',
      // 与原 .eslintrc.js 对齐的关闭项（第三方 API 交互/有意 fire-and-forget）
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
