# Iteration 1: Project Setup

## Goal

Initialize the project with all tooling, configure Claude Code hooks for the sandboxed environment, and install dependencies.

## Steps

### 1. Initialize pnpm project

Create `package.json`:
```json
{
  "name": "toold",
  "version": "0.1.0",
  "type": "module",
  "bin": { "toold": "./bin/cli.mjs" },
  "files": ["dist", "bin"],
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@10.17.1",
  "scripts": {
    "build": "obuild",
    "dev": "node src/cli.ts",
    "format": "prettier --write 'src/**/*.ts'",
    "format:check": "prettier --check 'src/**/*.ts'",
    "prepare": "husky",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "lint-staged": {
    "src/**/*.ts": "prettier --write"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "commander": "^14.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.2.7",
    "obuild": "^0.4.22",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "vitest": "^4.0.17"
  }
}
```

### 2. TypeScript config

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. Build config

Create `build.config.mjs`:
```javascript
import { defineBuildConfig } from 'obuild/config';

export default defineBuildConfig({
  entries: [{ type: 'bundle', input: './src/cli.ts' }],
});
```

### 4. CLI entry shim

Create `bin/cli.mjs`:
```javascript
#!/usr/bin/env node
import '../dist/cli.mjs';
```

### 5. Prettier config

Create `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

### 6. Husky + lint-staged

Create `.husky/pre-commit`:
```bash
pnpm lint-staged
```

### 7. Gitignore

Update `.gitignore` with:
```
node_modules
dist
*.tgz
coverage
.env
.env.*
.DS_Store
*.log
bin/_chunks/
```

### 8. Minimal source file

Create `src/cli.ts` with a placeholder:
```typescript
import { Command } from 'commander';

const program = new Command();
program.name('toold').version('0.1.0').description('MCP server proxy/aggregator');
program.parse();
```

### 9. Claude Code hooks setup

Configure `.claude/settings.json` with permissions for the sandboxed environment:
- Allow `pnpm install`, `pnpm build`, `pnpm test`, `pnpm format`
- Allow running the CLI via `node src/cli.ts` and `npx toold`

### 10. Install dependencies

```bash
pnpm install
```

## Verification

- `pnpm install` completes without errors
- `pnpm type-check` passes
- `pnpm build` produces `dist/cli.mjs`
- `node bin/cli.mjs --help` prints help text
- `pnpm format` runs without errors
