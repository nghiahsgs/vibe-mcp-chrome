# Phase 2: Chrome Profile Discovery

## Context
Need to read Chrome's `Local State` JSON to list available profiles with display names. No external deps needed -- just fs + JSON parsing.

## Overview
Implement `discover-profiles.ts` that reads macOS Chrome Local State file and returns profile list with metadata.

## Requirements
- Read `~/Library/Application Support/Google/Chrome/Local State`
- Parse `profile.info_cache` for profile directory names + display names
- Return typed array of profile objects
- Handle missing file, corrupt JSON, no profiles gracefully
- No external dependencies (pure Node.js fs)

## Implementation Steps

### 2.1 Define types
```typescript
// src/chrome/discover-profiles.ts
export interface ChromeProfile {
  /** Directory name: "Default", "Profile 1", etc. */
  directoryName: string;
  /** User-visible name from Chrome */
  displayName: string;
  /** Full path to profile directory */
  profilePath: string;
}
```

### 2.2 Implement profile discovery
```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CHROME_USER_DATA_DIR = join(
  homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome"
);

export async function discoverProfiles(): Promise<ChromeProfile[]> {
  const localStatePath = join(CHROME_USER_DATA_DIR, "Local State");
  const raw = await readFile(localStatePath, "utf-8");
  const localState = JSON.parse(raw);

  const infoCache = localState?.profile?.info_cache;
  if (!infoCache || typeof infoCache !== "object") {
    return [];
  }

  return Object.entries(infoCache).map(([dirName, meta]: [string, any]) => ({
    directoryName: dirName,
    displayName: meta.name || meta.shortcut_name || dirName,
    profilePath: join(CHROME_USER_DATA_DIR, dirName),
  }));
}
```

### 2.3 Export Chrome data dir constant
```typescript
export function getChromeUserDataDir(): string {
  return CHROME_USER_DATA_DIR;
}
```

### 2.4 Error handling
Wrap in try/catch. Possible errors:
- File not found: Chrome not installed or never launched
- JSON parse error: corrupt Local State
- No `profile.info_cache`: unusual Chrome state

Return descriptive error messages for CLI to display.

## Local State JSON Structure Reference
```json
{
  "profile": {
    "info_cache": {
      "Default": {
        "name": "Personal",
        "shortcut_name": "Person 1",
        "gaia_name": "John Doe",
        "user_name": "john@gmail.com",
        "is_using_default_name": false
      },
      "Profile 1": {
        "name": "Work",
        "shortcut_name": "Person 2",
        "gaia_name": "John Work",
        "user_name": "john@company.com"
      }
    }
  }
}
```

Fields priority for display name: `gaia_name` > `name` > `shortcut_name` > directory name.

Update implementation to prefer `gaia_name` when available:
```typescript
displayName: meta.gaia_name || meta.name || meta.shortcut_name || dirName
```

## Todo
- [ ] Create ChromeProfile interface
- [ ] Implement discoverProfiles()
- [ ] Export getChromeUserDataDir()
- [ ] Add error handling with descriptive messages
- [ ] Test with real Chrome Local State file
- [ ] Verify profile paths resolve correctly

## Success Criteria
- Returns correct profiles from real macOS Chrome installation
- Display names match what Chrome shows in profile switcher
- Graceful error when Chrome not installed
- No external dependencies used
