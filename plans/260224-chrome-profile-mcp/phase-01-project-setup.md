# Phase 1: Project Setup

## Context
Fresh repo. Need TypeScript project with build pipeline, dependencies, and proper structure before any feature code.

## Overview
Initialize Node.js/TypeScript project with all dependencies, tsconfig, build scripts, and folder structure.

## Requirements
- TypeScript with strict mode
- ESM modules (`"type": "module"` in package.json)
- Build to `dist/` via `tsc`
- Dev runner via `tsx`
- Binary entry point for `npx` usage
- All source in `src/`

## Implementation Steps

### 1.1 Initialize project
```bash
npm init -y
```
Set in `package.json`:
- `"name": "chrome-profile-mcp"`
- `"version": "0.1.0"`
- `"type": "module"`
- `"bin": { "chrome-profile-mcp": "./dist/cli.js" }`
- `"main": "./dist/mcp/server.js"`
- `"files": ["dist"]`

### 1.2 Install dependencies
```bash
# Runtime
npm i @modelcontextprotocol/sdk playwright commander @inquirer/prompts zod

# Dev
npm i -D typescript @types/node tsx
```

Note: Use `@inquirer/prompts` (modern ESM-native) instead of `inquirer` (legacy CJS).

### 1.3 TypeScript config
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### 1.4 Package scripts
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "start": "node dist/cli.js",
    "prepublishOnly": "npm run build"
  }
}
```

### 1.5 Create folder structure
```
src/
├── cli.ts
├── chrome/
│   ├── discover-profiles.ts
│   ├── launch-chrome.ts
│   └── connect-cdp.ts
├── mcp/
│   ├── server.ts
│   └── tools/
│       ├── navigation.ts
│       ├── interaction.ts
│       └── inspection.ts
└── utils/
    └── logger.ts
```

### 1.6 Create logger utility
`src/utils/logger.ts` - Simple stderr logger:
```typescript
export const log = {
  info: (...args: unknown[]) => console.error("[INFO]", ...args),
  warn: (...args: unknown[]) => console.error("[WARN]", ...args),
  error: (...args: unknown[]) => console.error("[ERROR]", ...args),
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) console.error("[DEBUG]", ...args);
  }
};
```

### 1.7 Create .gitignore
```
node_modules/
dist/
*.tsbuildinfo
.env
```

### 1.8 Add shebang to cli.ts
```typescript
#!/usr/bin/env node
// Entry point - implementation in Phase 5
```

## Todo
- [ ] `npm init` + configure package.json
- [ ] Install all dependencies
- [ ] Create tsconfig.json
- [ ] Create folder structure with stub files
- [ ] Create logger utility
- [ ] Create .gitignore
- [ ] Verify `npm run build` succeeds
- [ ] Verify `npm run dev` runs without error

## Success Criteria
- `npm run build` compiles without errors
- `npm run dev` runs stub CLI without crash
- All directories and stub files exist
- TypeScript strict mode enabled
