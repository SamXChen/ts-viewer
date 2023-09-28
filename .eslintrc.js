const jsConfig = {
  files: [
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs',
  ],
  extends: [
    'eslint:recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    // 警告风格异常的代码
    'prettier/prettier': 'warn',
  },
  parserOptions: {
    ecmaVersion: 'latest',
  },
  env: {
    es6: true,
  }
};

const tsConfig = {
  files: [
    '**/*.ts',
    '**/*.tsx',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    parser: '@typescript-eslint/parser',
    project: './tsconfig.eslint.json',
  },
  rules: {
    // 警告风格异常的代码
    'prettier/prettier': 'warn',
    // 允许 arguments 类型为 any
    '@typescript-eslint/no-unsafe-argument': 'off',
    // 允许 any 类型赋值
    '@typescript-eslint/no-unsafe-assignment': 'off',
    // 允许 any 类型的变量
    '@typescript-eslint/no-unsafe-member-access': 'off',
    // 允许 any 类型作为函数调用
    '@typescript-eslint/no-unsafe-call': 'off',
    // 允许显式使用 any
    '@typescript-eslint/no-explicit-any': 'off',
    // 允许没有 await 的 Promise 使用
    '@typescript-eslint/no-floating-promises': 'off',
    // 允许函数返回 any
    '@typescript-eslint/no-unsafe-return': 'off',
  },
};

module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.tsx', '.ts', '.d.ts', '.jsx', '.mjs', '.js'],
      },
    },
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.*.js',
    'packages/chrome/devtools/',
  ],
  plugins: ['prettier'],
  overrides: [
    {
      ...jsConfig,
    },
    {
      ...tsConfig,
    },
  ],
};
