import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
   { ignores: ['**/dist/**', '**/.wrangler/**', '**/.turbo/**', '**/node_modules/**'] },
   js.configs.recommended,
   ...tseslint.configs.recommended,
   {
      files: ['packages/email/src/**/*.ts'],
      rules: {
         'no-restricted-imports': [
            'error',
            {
               patterns: [
                  {
                     group: [
                        '@mailer/api',
                        '@mailer/webapp',
                        '@mailer/ui',
                        '@mailer/editor',
                        '@mailer/shared',
                        '@mailer/worker-kit',
                        'preact*',
                        'hono',
                     ],
                     message:
                        '@mailer/email must stay dependency-free and portable (no DOM, no React, no app code).',
                  },
               ],
            },
         ],
      },
   },
   {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
         '@typescript-eslint/no-unused-vars': [
            'warn',
            { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
         ],
         '@typescript-eslint/no-explicit-any': 'warn',
         '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      },
   },
);
