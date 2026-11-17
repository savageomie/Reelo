const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'supabase/functions/*', 'node_modules/*', '.expo/*', 'coverage/*']),
  expoConfig,
  {
    rules: {
      'react/display-name': 'off',
    },
  },
]);
