// Root-level ESLint flat config for the Abetworks platform monorepo.
//
// This is the single source of truth for TypeScript code-quality linting
// across all standalone packages (there is no workspace manager, so a
// per-package config would duplicate 15x). It mirrors the low-noise Python
// ruff philosophy: enable only high-value rules, no stylistic/line-length
// churn, and no type-aware (type-checked) rules.
//
// Enforced rules (errors):
//   - no-console                            (allowed in migration CLIs + stdout tools + tests)
//   - @typescript-eslint/no-explicit-any    (discourage `any` / `as any`)

const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  // Never lint dependencies, build output, declaration files, or caches.
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.d.ts",
      ".ruff_cache/**",
    ],
  },

  // Base: typescript-eslint `base` only registers the parser + plugin without
  // enabling any rules, so we get exactly the two high-value rules below and
  // no unrelated churn (mirrors the low-noise Python ruff philosophy). We
  // deliberately do NOT extend `recommended`, which would surface unrelated
  // rules (e.g. no-unused-vars) that are out of scope for this task.
  {
    files: [
      "niche-plans/**/scaffolding/services/*/src/**/*.ts",
      "niche-plans/00-platform-baseline/packages/core/src/**/*.ts",
      "platform/*/src/**/*.ts",
    ],
    extends: [tseslint.configs.base],
    // Existing exempt files (db.ts, check.ts) still carry inline
    // `// eslint-disable-next-line no-console` comments from before this
    // config existed; since we turn no-console off for them via overrides,
    // do not report those now-redundant directives as noise.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Allow console in migration CLIs, the stdout drift tool, and test files.
  {
    files: [
      "**/src/db.ts",
      "platform/api-tools/src/check.ts",
      "**/*.test.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
);
