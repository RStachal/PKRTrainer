import type { VillainArchetype } from "../../core/villain/archetypes";

/**
 * Kresby avatarů (Agents/plan-gto-real-2026-11.md, oddíl 5; návrh
 * Agents/design/avatary-v1.html).
 *
 * Vnitřek SVG ve viewBoxu 100 × 100: medailon s kovovým lemem, pozadí v barvě
 * typu, kresba a lesk. Barvy tu jsou natvrdo, stejně jako barvy akcí
 * v `colorForActionKey`: je to kresba, ne motiv, a tokeny vzhledu se jí
 * netýkají. Identifikátory gradientů začínají `av-`; `playerAvatar` je
 * u každého avataru přejmenuje, aby se dva stejné na stole nepletly.
 *
 * Žeton GTO nese pozici: `{label}` a `{labelSize}` doplní `playerAvatar`.
 */

export type AvatarKind = VillainArchetype | "GTO" | "HERO";

const RING = `<linearGradient id="av-ring" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:#eef2f7"/><stop offset="0.45" style="stop-color:#8b95a4"/><stop offset="1" style="stop-color:#343b46"/></linearGradient><linearGradient id="av-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:#ffffff;stop-opacity:0.22"/><stop offset="1" style="stop-color:#ffffff;stop-opacity:0"/></linearGradient><clipPath id="av-clip"><circle cx="50" cy="50" r="45"/></clipPath>`;

const FRAME_BACK = (background: string): string => (
  `<circle cx="50" cy="50" r="49" fill="url(#av-ring)"/><circle cx="50" cy="50" r="45" fill="url(#${background})"/>`
);

const FRAME_FRONT = `<ellipse cx="50" cy="21" rx="30" ry="12" fill="url(#av-gloss)"/><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0,0,0,0.4)" style="stroke-width:1"/>`;

const radial = (id: string, stops: readonly string[], cy = "34%"): string => (
  `<radialGradient id="${id}" cx="50%" cy="${cy}" r="70%">${stops.map((stop) => {
    const [offset, color] = stop.split(" ");
    return `<stop offset="${offset}" style="stop-color:${color}"/>`;
  }).join("")}</radialGradient>`
);

const linear = (id: string, stops: readonly string[], coords = 'x1="0" y1="0" x2="0" y2="1"'): string => (
  `<linearGradient id="${id}" ${coords}>${stops.map((stop) => {
    const [offset, color] = stop.split(" ");
    return `<stop offset="${offset}" style="stop-color:${color}"/>`;
  }).join("")}</linearGradient>`
);

const SHARK = `<defs>${radial("av-shark-bg", ["0 #1aa3bd", "0.55 #0b5c70", "1 #04202a"], "36%")}${linear("av-shark-body", ["0 #56788c", "0.5 #9fb8c6", "1 #eef5f8"])}${RING}</defs>${FRAME_BACK("av-shark-bg")}<g style="clip-path:url(#av-clip)"><path d="M58 4 L70 4 L40 100 L30 100 Z" fill="rgba(255,255,255,0.06)"/><path d="M76 4 L82 4 L58 100 L52 100 Z" fill="rgba(255,255,255,0.05)"/><circle cx="76" cy="27" r="2.2" fill="none" stroke="rgba(255,255,255,0.55)" style="stroke-width:0.9"/><circle cx="80" cy="20" r="1.5" fill="none" stroke="rgba(255,255,255,0.45)" style="stroke-width:0.8"/><circle cx="73" cy="16" r="1" fill="none" stroke="rgba(255,255,255,0.4)" style="stroke-width:0.7"/><path d="M42 44 C46 36.5 52 28.5 60 24 C58.5 31 58.5 38 62 44.5 Z" fill="#557689"/><path d="M11 57 C15 50 26 45 40 43.5 C50 42.5 60 43 68 45.5 C74 47 79 47 83 43 L89 33 C88.5 41 87.5 48 85.5 54 C87 59 88 64 88.5 70 C84 66 79 62.5 74 61 C64 65 50 68 37 67.5 C26 67 16 63.5 11 57 Z" fill="url(#av-shark-body)"/><path d="M13 58.5 C22 63.5 38 66.5 60 64.5 C50 67.8 38 68.4 28 66.8 C21 65.6 15.5 62.5 13 58.5 Z" fill="rgba(255,255,255,0.6)"/><path d="M38 65 C40 71 44 77 51 80.5 C50 74 49 69.5 50 66.5 Z" fill="#6c8ea1"/><path d="M33 51 C34.4 54 34.4 57 33 60 M36.2 50.5 C37.7 53.8 37.7 57.6 36.2 61 M39.4 50 C41 53.6 41 57.8 39.4 61.6" fill="none" stroke="#4a6a7d" style="stroke-width:1;stroke-linecap:round"/><path d="M14.2 60.4 C18 62.6 23 63.3 28.4 62.4" fill="none" stroke="#24343f" style="stroke-width:1.1;stroke-linecap:round"/><circle cx="23.5" cy="52" r="2.1" fill="#0b1a22"/><circle cx="24.2" cy="51.3" r="0.6" fill="#ffffff"/></g>${FRAME_FRONT}`;

const EAGLE = `<defs>${radial("av-eagle-bg", ["0 #4a6bb0", "0.6 #1c2c5c", "1 #0a1029"])}<radialGradient id="av-eagle-sun" cx="50%" cy="50%" r="50%"><stop offset="0" style="stop-color:#f6c453;stop-opacity:0.55"/><stop offset="1" style="stop-color:#f6c453;stop-opacity:0"/></radialGradient>${linear("av-eagle-head", ["0 #ffffff", "1 #d3dae3"])}${linear("av-eagle-beak", ["0 #ffd56b", "1 #e0961a"])}${linear("av-eagle-body", ["0 #6b4524", "1 #2e1b0b"])}${RING}</defs>${FRAME_BACK("av-eagle-bg")}<g style="clip-path:url(#av-clip)"><circle cx="70" cy="64" r="34" fill="url(#av-eagle-sun)"/><path d="M36 100 C38 84 48 74 60 71 C72 68 84 74 92 86 L96 100 Z" fill="url(#av-eagle-body)"/><path d="M33 47 C35 36 46 28 59 28.5 C72 29 82 38.5 82.5 51 C83 61 78 69 70 73.5 C62 77.5 52 77 46 73 C41.5 69.5 39 64 37.5 59 C36.5 55.5 34.5 51 33 47 Z" fill="url(#av-eagle-head)"/><path d="M44 72.5 L48 79 L52 74.5 L56.5 81 L60.5 75.5 L65 81.5 L68.5 75 L73.5 79.5 L75 71.5 C70 74.5 62 77.5 52 76.8 C48.8 76.4 46.2 75 44 72.5 Z" fill="#d6dce4"/><path d="M64 38 Q69 40 71.5 45 M68.5 49 Q73.5 51 74.5 56.5 M60 57 Q65 59 67 64" fill="none" stroke="#bcc5d0" style="stroke-width:1;stroke-linecap:round"/><path d="M39.5 42 C44 38.8 50.5 38.8 55.5 41.6 C50.8 41.2 45.2 42.4 41 45.2 Z" fill="#9aa5b3"/><path d="M35.5 46 C29 45.5 21 47.5 15.5 53 C13.4 55.2 13.2 59 15.6 61.4 C16.6 58.6 18.6 57 21.6 56.6 C25.6 57.4 30.6 58.4 37 57.6 Z" fill="url(#av-eagle-beak)"/><path d="M21.2 59.6 C25.8 60.9 31 61.6 36.6 60.2 L37 57.6 C30.6 58.8 25.6 58.9 21.2 59.6 Z" fill="#b8770c"/><ellipse cx="30" cy="50.6" rx="1.4" ry="0.8" fill="#7a4d06"/><circle cx="46.5" cy="45.5" r="3.3" fill="#f2c14e"/><circle cx="46.2" cy="45.6" r="1.8" fill="#1a1206"/><circle cx="47.2" cy="44.6" r="0.6" fill="#ffffff"/></g>${FRAME_FRONT}`;

const ROCK = `<defs>${radial("av-rock-bg", ["0 #5f7896", "0.6 #27364a", "1 #0f151e"])}${linear("av-rock-body", ["0 #d4d8de", "0.55 #9aa1ab", "1 #545b66"], 'x1="0.15" y1="0.1" x2="0.85" y2="0.95"')}${RING}</defs>${FRAME_BACK("av-rock-bg")}<g style="clip-path:url(#av-clip)"><ellipse cx="51" cy="79.5" rx="29" ry="4.6" fill="rgba(0,0,0,0.38)"/><path d="M20 66 C18 55 24 43.5 36.5 37.5 C46.5 32.8 61.5 32 71.5 37.8 C81.8 43.8 86 55.6 82.4 65.8 C79 74.6 66.5 78.6 52 78.4 C37.8 78.2 22.8 75.2 20 66 Z" fill="url(#av-rock-body)" stroke="rgba(18,22,28,0.7)" style="stroke-width:1.2"/><path d="M36.5 37.5 C40 45 41 53 37 61 C33 56 28 52 21.5 57 C23 48 28.5 41.5 36.5 37.5 Z" fill="rgba(255,255,255,0.12)"/><path d="M61 39.4 C63 47 62 55 58.4 55.6 C66 58 74 58 82.6 61 C83 52 78 44 71.5 37.8 C68 38 64 38.4 61 39.4 Z" fill="rgba(20,24,30,0.16)"/><path d="M77 79.6 C75 75.5 78 72.5 82 72.5 C86 72.5 88 75.5 86.5 79 C84 80.4 80 80.6 77 79.6 Z" fill="#8a929d" stroke="rgba(18,22,28,0.7)" style="stroke-width:0.9"/><path d="M30 47 C37.5 39.5 51.5 36.2 61 39.4 C50.5 40.6 40.4 44.4 32.6 51.4 Z" fill="rgba(255,255,255,0.3)"/><path d="M66 41 C73 44 78 50 79.5 57 C75.5 51.5 71 47 64.5 44 Z" fill="rgba(255,255,255,0.14)"/><path d="M24 67.5 C34.5 73.8 56 76.2 79.4 67.2 C73.4 75.2 61.4 78 50.6 78 C38.4 78 28.4 74 24 67.5 Z" fill="rgba(31,36,44,0.5)"/><path d="M57.5 41.5 L53.2 50.4 L58.4 55.6 L55 63.8" fill="none" stroke="#3b424d" style="stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round"/><path d="M53.2 50.4 L48.6 53.2" fill="none" stroke="#3b424d" style="stroke-width:1.1;stroke-linecap:round"/><ellipse cx="39.5" cy="39.2" rx="6.2" ry="2.5" fill="#557f37" transform="rotate(-20 39.5 39.2)"/><ellipse cx="47.6" cy="36.2" rx="3.8" ry="1.8" fill="#5f8f3e" transform="rotate(-8 47.6 36.2)"/><ellipse cx="38.4" cy="38.4" rx="2.6" ry="0.9" fill="#86b85a" transform="rotate(-20 38.4 38.4)"/><circle cx="70" cy="61" r="1.1" fill="rgba(31,36,44,0.45)"/><circle cx="35" cy="62" r="0.9" fill="rgba(31,36,44,0.4)"/><circle cx="62" cy="70" r="0.8" fill="rgba(31,36,44,0.4)"/></g>${FRAME_FRONT}`;

const CHIP_LAYER = (y: number, edge: string, top: string, dash: string): string => (
  `<path d="M67 ${y + 3} L67 ${y} A11 4 0 0 0 89 ${y} L89 ${y + 3} A11 4 0 0 1 67 ${y + 3} Z" fill="${edge}"/><ellipse cx="78" cy="${y}" rx="11" ry="4" fill="${top}"/><ellipse cx="78" cy="${y}" rx="8.4" ry="3" fill="none" stroke="${dash}" style="stroke-width:1.2;stroke-dasharray:2.4 3.2"/>`
);

const DICE = `<defs>${radial("av-dice-bg", ["0 #9d4fe0", "0.6 #4a1677", "1 #1c0730"])}${RING}</defs>${FRAME_BACK("av-dice-bg")}<g style="clip-path:url(#av-clip)"><ellipse cx="54" cy="80" rx="30" ry="4.6" fill="rgba(0,0,0,0.4)"/>${CHIP_LAYER(75.5, "#7a1010", "#c62828", "#ffffff")}${CHIP_LAYER(71, "#0f3b6b", "#1f63b0", "#ffffff")}${CHIP_LAYER(66.5, "#141414", "#2b2b2b", "#e8e8e8")}<polygon points="24,33 48,21 72,33 72,61 48,73 24,61" fill="#5b4b37" stroke="#5b4b37" style="stroke-width:2.4;stroke-linejoin:round"/><g transform="matrix(1 -0.5 1 0.5 24 33)"><rect x="0.7" y="0.7" width="22.6" height="22.6" rx="3.4" fill="#fffaf0"/><circle cx="12" cy="12" r="3.4" fill="#d7263d"/></g><g transform="matrix(1 0.5 0 1.1667 24 33)"><rect x="0.7" y="0.7" width="22.6" height="22.6" rx="3.4" fill="#ece3d1"/><circle cx="6" cy="6" r="2.5" fill="#251d33"/><circle cx="12" cy="12" r="2.5" fill="#251d33"/><circle cx="18" cy="18" r="2.5" fill="#251d33"/></g><g transform="matrix(1 -0.5 0 1.1667 48 45)"><rect x="0.7" y="0.7" width="22.6" height="22.6" rx="3.4" fill="#d3c5aa"/><circle cx="6" cy="6" r="2.5" fill="#251d33"/><circle cx="18" cy="6" r="2.5" fill="#251d33"/><circle cx="12" cy="12" r="2.5" fill="#251d33"/><circle cx="6" cy="18" r="2.5" fill="#251d33"/><circle cx="18" cy="18" r="2.5" fill="#251d33"/></g></g>${FRAME_FRONT}`;

const WHALE = `<defs>${radial("av-whale-bg", ["0 #3f6fe0", "0.6 #16307a", "1 #081236"])}${linear("av-whale-body", ["0 #5a8fdc", "1 #22437f"])}<radialGradient id="av-coin" cx="40%" cy="35%" r="70%"><stop offset="0" style="stop-color:#ffe08a"/><stop offset="1" style="stop-color:#c98f12"/></radialGradient>${RING}</defs>${FRAME_BACK("av-whale-bg")}<g style="clip-path:url(#av-clip)"><circle cx="70" cy="29" r="4.2" fill="url(#av-coin)" stroke="#9a6a07" style="stroke-width:0.7"/><circle cx="79" cy="36" r="3.3" fill="url(#av-coin)" stroke="#9a6a07" style="stroke-width:0.6"/><circle cx="64" cy="20" r="2.6" fill="url(#av-coin)" stroke="#9a6a07" style="stroke-width:0.5"/><path d="M36 37 C34 30 30 25.5 24.5 24 M36 37 C36 29 36.4 23 38 18 M36 37 C38.4 30 43 26 49 25.5" fill="none" stroke="#bfe3ff" style="stroke-width:2;stroke-linecap:round"/><circle cx="22.6" cy="23.6" r="1.6" fill="#bfe3ff"/><circle cx="38.6" cy="16.2" r="1.6" fill="#bfe3ff"/><circle cx="51" cy="25.2" r="1.6" fill="#bfe3ff"/><path d="M12 60 C12 47 26 39 44 38.5 C58 38 69 42.5 76 49.5 C79.5 53 82.5 55 85.5 53 L89 46 C90.1 44 92.6 44.3 92.6 46.8 L91.4 53 C93.4 52.2 94.8 54 93.6 56.2 L88.6 62.4 C85.2 65.4 80.4 65.8 76.6 63.8 C70.6 70.2 59 74.4 45 74.4 C27.6 74.4 12 70.6 12 60 Z" fill="url(#av-whale-body)"/><path d="M15 63 C21 70.5 33.5 73.6 46 73.6 C58.5 73.6 68.5 70 74.5 64.6 C64 68.8 50.5 70.6 40 69.8 C29.5 69 21 66.6 15 63 Z" fill="#c4d8f2"/><path d="M22 66.6 C30 69.4 42 70.6 54 70 M26.5 69 C34 71.2 44 72 53 71.6" fill="none" stroke="#8fb0db" style="stroke-width:0.8;stroke-linecap:round"/><path d="M37 67.5 C39.5 74 45.5 79.6 53.5 81 C50 75.5 48 71 46.4 67.6 Z" fill="#2a4f8c"/><path d="M13.6 61 C19 63.8 27 64.6 35 62.8" fill="none" stroke="#13254d" style="stroke-width:1.1;stroke-linecap:round"/><circle cx="26" cy="55" r="2" fill="#0b1530"/><circle cx="26.7" cy="54.3" r="0.6" fill="#ffffff"/></g>${FRAME_FRONT}`;

const CHIP_EDGE = [0, 45, 90, 135, 180, 225, 270, 315]
  .map((angle) => `<rect x="46" y="6.5" width="8" height="10" rx="2"${angle === 0 ? "" : ` transform="rotate(${angle} 50 50)"`}/>`)
  .join("");

const GTO = `<defs>${radial("av-gto-bg", ["0 #3b4558", "1 #161b24"], "38%")}${RING}</defs>${FRAME_BACK("av-gto-bg")}<g fill="#d9dee6">${CHIP_EDGE}</g><circle cx="50" cy="50" r="30" fill="#1d232e"/><circle cx="50" cy="50" r="30" fill="none" stroke="#7c8899" style="stroke-width:1.2;stroke-dasharray:2 2.6"/><circle cx="50" cy="50" r="26" fill="none" stroke="rgba(255,255,255,0.08)" style="stroke-width:1"/><text x="50" y="51" style="font-family:'Segoe UI',system-ui,sans-serif;font-weight:800;font-size:{labelSize}px;text-anchor:middle;dominant-baseline:central;fill:#eef2f7;letter-spacing:0.5px">{label}</text><ellipse cx="50" cy="21" rx="30" ry="12" fill="url(#av-gloss)"/>`;

const HERO = `<defs>${radial("av-hero-bg", ["0 #2fbf8a", "0.6 #0d5c44", "1 #052a20"])}${linear("av-hero-hood", ["0 #334155", "1 #1e293b"])}${RING}</defs>${FRAME_BACK("av-hero-bg")}<g style="clip-path:url(#av-clip)"><path d="M15 100 C17 79 31 67 50 67 C69 67 83 79 85 100 Z" fill="url(#av-hero-hood)"/><path d="M45 70 L44 86 M55 70 L56 86" fill="none" stroke="#cbd5e1" style="stroke-width:1.2;stroke-linecap:round"/><circle cx="44" cy="87" r="1.3" fill="#cbd5e1"/><circle cx="56" cy="87" r="1.3" fill="#cbd5e1"/><path d="M28.5 62 C25.5 43 34 25.5 50 25 C66 25.5 74.5 43 71.5 62 C67 67 60 69.5 50 69.5 C40 69.5 33 67 28.5 62 Z" fill="url(#av-hero-hood)"/><path d="M34 60 C32 46 39 34 50 33.6 C61 34 68 46 66 60 C62 63.4 57 65 50 65 C43 65 38 63.4 34 60 Z" fill="#0f172a"/><ellipse cx="50" cy="49" rx="12.6" ry="15" fill="#d9f4e9"/><path d="M37.6 44 C37.6 42.2 39 41.4 41 41.4 L47.4 41.4 C48.8 41.4 49.2 42.4 49 43.6 L48.4 47 C48.2 48.4 47.2 49 45.8 49 L41.2 49 C39 49 37.6 47.6 37.6 45.8 Z" fill="#0b1220"/><path d="M62.4 44 C62.4 42.2 61 41.4 59 41.4 L52.6 41.4 C51.2 41.4 50.8 42.4 51 43.6 L51.6 47 C51.8 48.4 52.8 49 54.2 49 L58.8 49 C61 49 62.4 47.6 62.4 45.8 Z" fill="#0b1220"/><path d="M49 43.4 L51 43.4" stroke="#0b1220" style="stroke-width:1.2"/><path d="M40 43.2 L44.6 43.2 M53.6 43.2 L58.2 43.2" stroke="rgba(255,255,255,0.4)" style="stroke-width:0.9;stroke-linecap:round"/><path d="M45.2 56 Q50 59.2 54.8 56" fill="none" stroke="#0b3b2c" style="stroke-width:1.3;stroke-linecap:round"/></g>${FRAME_FRONT}`;

export const AVATAR_ART: Readonly<Record<AvatarKind, string>> = {
  SHARK,
  EAGLE,
  ROCK,
  DICE,
  WHALE,
  GTO,
  HERO,
};
