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

export interface ChromeProfile {
  /** Directory name: "Default", "Profile 1", etc. */
  directoryName: string;
  /** User-visible name from Chrome */
  displayName: string;
  /** Full path to profile directory */
  profilePath: string;
}

/**
 * Reads Chrome's Local State JSON and returns available profiles.
 * Priority for display name: gaia_name > name > shortcut_name > dirName
 */
export async function discoverProfiles(): Promise<ChromeProfile[]> {
  const localStatePath = join(CHROME_USER_DATA_DIR, "Local State");

  try {
    const raw = await readFile(localStatePath, "utf-8");
    const localState = JSON.parse(raw);
    const infoCache = localState?.profile?.info_cache;

    if (!infoCache || typeof infoCache !== "object") {
      return [];
    }

    return Object.entries(infoCache).map(
      ([dirName, meta]: [string, unknown]) => {
        const m = meta as Record<string, string>;
        return {
          directoryName: dirName,
          displayName:
            m.gaia_name || m.name || m.shortcut_name || dirName,
          profilePath: join(CHROME_USER_DATA_DIR, dirName),
        };
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT")) {
      throw new Error(
        "Chrome Local State not found. Is Google Chrome installed and has been launched at least once?"
      );
    }
    throw new Error(`Failed to read Chrome profiles: ${msg}`);
  }
}

export function getChromeUserDataDir(): string {
  return CHROME_USER_DATA_DIR;
}
