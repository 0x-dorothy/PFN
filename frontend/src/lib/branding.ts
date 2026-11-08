/**
 * Single source of truth for the product identity.
 *
 * Renaming the app means editing APP_NAME here and APP_NAME / APP_FULL_NAME in
 * backend/app/core/config.py. Nothing else in the UI hardcodes the name — the
 * logo, the page title, the About line and every storage key read from here.
 */
export const APP_NAME = "PFN";
export const APP_FULL_NAME = "Private Finance Tracker";
export const APP_TAGLINE = "Личные финансы — на вашем компьютере";

/**
 * localStorage keys are namespaced so two builds (this one and an older fork)
 * can share a browser profile without overwriting each other's settings.
 */
const PREFIX = "pfn";

export function storageKey(name: string): string {
  return `${PREFIX}:${name}`;
}
