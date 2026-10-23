/**
 * Šířky, na kterých se aplikace ověřuje v prohlížeči: E2E (runChromeE2e.mts)
 * i prohlídka UI se snímky (uiTour.mts). Mobilní trojice odpovídá
 * Agents/mobile-screenshot-qa-2026-06-12.md.
 */
export interface Viewport {
  name: string;
  width: number;
  height: number;
  mobile: boolean;
}

export const QA_VIEWPORTS: readonly Viewport[] = [
  { name: "desktop-1280", width: 1280, height: 900, mobile: false },
  { name: "mobile-360", width: 360, height: 800, mobile: true },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-412", width: 412, height: 915, mobile: true },
];
