import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { readRyeRangeImageGrids } from "../../scripts/lib/ryeRangeImageGrid.mts";

/**
 * Dekodér obrázkových ranží RYE.
 *
 * Testuje se na obrázku, který si test **nakreslí sám**. Zdrojové obrázky jsou
 * koupený materiál a do repozitáře nesmí (brána nad `Agents/range-intake/raw`),
 * takže fixtura musí vzniknout v testu - a zároveň je to poctivější: kreslí se
 * přesně to, co dekodér tvrdí, že umí číst, a nic jiného.
 *
 * Rastr napodobuje skutečné obrázky, jak byly naměřené 23. 9. 2026: hlavička
 * s textem nahoře, pod ní mřížka 13x13 přes celou šířku, zelené buňky vyplněné
 * světle zelenou, ostatní růžové nebo bílé. A varianta se dvěma panely vedle
 * sebe, protože open-shove obrázky jsou dva grafy v jednom souboru.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Minimální PNG: 8bitové RGB, bez filtru. */
function writePng(path: string, width: number, height: number, rgb: Uint8Array): void {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 3 + 1)] = 0;
    rgb.subarray(y * width * 3, (y + 1) * width * 3)
      .forEach((value, index) => { rows[y * (width * 3 + 1) + 1 + index] = value; });
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

const GREEN: [number, number, number] = [200, 240, 200];
const PINK: [number, number, number] = [245, 200, 200];
const WHITE: [number, number, number] = [250, 250, 250];

interface PanelSpec { jamCells: Set<string> }

/**
 * Nakreslí obrázek s jedním nebo dvěma panely.
 *
 * Buňka je 40x36 px, hlavička 30 px - tedy rozměry z korpusu. Do hlavičky se
 * kreslí pár tmavých bodů jako písmo, aby se nepletla s mřížkou.
 */
function drawImage(path: string, panels: PanelSpec[]): void {
  const cellW = 40;
  const cellH = 36;
  const headerH = 30;
  const panelW = cellW * 13;
  const gap = panels.length > 1 ? 12 : 0;
  const width = panels.length * panelW + gap * (panels.length - 1);
  const height = headerH + cellH * 13;
  const rgb = new Uint8Array(width * height * 3).fill(255);
  const put = (x: number, y: number, [r, g, b]: [number, number, number]): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = (y * width + x) * 3;
    rgb[at] = r;
    rgb[at + 1] = g;
    rgb[at + 2] = b;
  };

  for (const [index, panel] of panels.entries()) {
    const originX = index * (panelW + gap);
    // Hlavička: několik tmavých bodů, ať má řádek nějaké písmo.
    for (let x = 4; x < 120; x += 3) put(originX + x, 12, [40, 40, 40]);
    for (let row = 0; row < 13; row += 1) {
      for (let col = 0; col < 13; col += 1) {
        const hand = handName(row, col);
        const fill = panel.jamCells.has(hand) ? GREEN : (row + col) % 3 === 0 ? WHITE : PINK;
        for (let y = 0; y < cellH; y += 1) {
          for (let x = 0; x < cellW; x += 1) {
            put(originX + col * cellW + x, headerH + row * cellH + y, fill);
          }
        }
      }
    }
  }
  writePng(path, width, height, rgb);
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
function handName(row: number, col: number): string {
  if (row === col) return `${RANKS[row]}${RANKS[row]}`;
  return row < col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`;
}

const dir = mkdtempSync(join(tmpdir(), "rye-image-"));

describe("dekodér obrázkových ranží", () => {
  it("najde mřížku pod hlavičkou a přečte, které buňky jsou zelené", () => {
    const jam = new Set(["AA", "AKs", "AKo", "KK", "77", "22"]);
    const path = join(dir, "jeden-panel.png");
    drawImage(path, [{ jamCells: jam }]);

    const grids = readRyeRangeImageGrids(path);
    expect(grids).toHaveLength(1);
    const grid = grids[0];
    expect(grid.cells).toHaveLength(169);
    expect(new Set(grid.jamHands)).toEqual(jam);
    // AA 6 + AKs 4 + AKo 12 + KK 6 + 77 6 + 22 6 = 40 kombinací z 1326.
    expect(grid.jamShare).toBeCloseTo(40 / 1326, 4);
    // Hlavička do mřížky nepatří: pruh začíná až pod ní.
    expect(grid.band.top).toBeGreaterThanOrEqual(28);
  });

  it("dva panely v jednom souboru jsou dvě různé mřížky", () => {
    const left = new Set(["AA", "AKs"]);
    const right = new Set(["QQ", "JTs", "55"]);
    const path = join(dir, "dva-panely.png");
    drawImage(path, [{ jamCells: left }, { jamCells: right }]);

    const grids = readRyeRangeImageGrids(path);
    expect(grids).toHaveLength(2);
    expect(new Set(grids[0].jamHands)).toEqual(left);
    expect(new Set(grids[1].jamHands)).toEqual(right);
    // Panely se v názvu rozliší, jinak by druhý přepsal první.
    expect(grids[0].file).not.toBe(grids[1].file);
  });

  it("obrázek bez mřížky nevrátí nic - radši nic než vymyšlená range", () => {
    const path = join(dir, "bez-mrizky.png");
    const width = 200;
    const height = 60;
    const rgb = new Uint8Array(width * height * 3).fill(250);
    writePng(path, width, height, rgb);
    expect(readRyeRangeImageGrids(path)).toEqual([]);
  });
});
