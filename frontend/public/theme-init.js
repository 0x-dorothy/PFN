// Applies the saved theme (light/dark/system) to <html> before the first
// paint, so an explicit override never flashes the wrong theme for a frame
// while React/lib/theme.ts loads. "system" needs no attribute at all --
// index.css's prefers-color-scheme media query already handles that case with
// zero JS.
//
// Lives in public/ as its own file rather than inline in index.html so a strict
// Content-Security-Policy can forbid inline scripts outright. Loaded as a
// plain synchronous <script src> in <head>, which still blocks the first paint,
// so the no-flash behaviour is unchanged.
//
// The key has to match lib/branding.ts's storageKey("theme").
(function () {
  var stored = localStorage.getItem("pfn:theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
  var isDark =
    stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // Accent: written straight through, validated against the preset list in
  // lib/theme.ts. An unknown value simply matches no [data-accent] block and
  // leaves the default palette in place.
  var accent = localStorage.getItem("pfn:accent");
  if (accent) document.documentElement.setAttribute("data-accent", accent);

  var meta = document.querySelector('meta[name="theme-color"]');
  // Kept in sync by hand with index.css's --surface-0 light/dark values.
  if (meta) meta.setAttribute("content", isDark ? "#0d0d0d" : "#f9f9f7");
})();
