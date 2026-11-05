import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/**
 * Čtení obrázkové ranže RYE (rejam a open-shove).
 *
 * ## Proč vůbec
 *
 * Rodiny `RESHOVING` (82 souborů), `OPENSHOVING` (17) a `HU` (24) nedávají
 * **ani jednu** čitelnou mřížku: jejich stránky jsou rozcestníky, které místo
 * tabulky ukazují PNG. Ty obrázky v korpusu jsou - 505 rejamových a 120
 * open-shove - a je v nich přesně rejam, tedy rodina, kterou vytkl kouč a
 * kterou HTML cestou nejde přečíst (rozhodnutí vlastníka 1a, 23. 9. 2026:
 * číst obojí).
 *
 * ## Co obrázek nese
 *
 * Mřížku 13x13, kde **poloha** buňky říká ruku (řádek a sloupec jsou pořadí
 * hodnot od esa dolů, nad diagonálou suited, pod ní offsuit), **barva** akci
 * a **text** v buňce EV té ruky v blindech. Nahoře je hlavička se šířkou
 * range („BB calls 18875 against BU: 17.5%").
 *
 * ## Co tenhle modul dělá a co ne
 *
 * Dekóduje PNG bez knihovny (jen `zlib` z Node) a vrací **vzorky barvy** pro
 * každou buňku. Nic si nedomýšlí: klasifikace na akci a čtení čísel patří
 * o patro výš, protože obojí je tvrzení o obsahu, kdežto tohle je jen rastr.
 */

export interface RyeImage {
  width: number;
  height: number;
  /** Barva pixelu jako [r, g, b]; mimo obrázek vrací černou. */
  rgbAt: (x: number, y: number) => [number, number, number];
}

interface Chunk { type: string; data: Buffer }

function chunks(buffer: Buffer): Chunk[] {
  const out: Chunk[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    out.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return out;
}

/** Paethův prediktor z PNG filtru 4. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * PNG bez knihovny.
 *
 * Projekt nemá závislost na obrázky a kvůli 625 souborům ji zavádět nebudeme:
 * všechny obrázky RYE jsou osmibitové RGB(A) nebo paleta, což je pár desítek
 * řádků. Cokoli jiného se **odmítne**, ne uhodne - špatně dekódovaný obrázek
 * by vypadal jako range.
 */
export function readRyePng(path: string): RyeImage | undefined {
  const buffer = readFileSync(path);
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return undefined;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette: Buffer | undefined;
  const idat: Buffer[] = [];
  for (const chunk of chunks(buffer)) {
    if (chunk.type === "IHDR") {
      width = chunk.data.readUInt32BE(0);
      height = chunk.data.readUInt32BE(4);
      bitDepth = chunk.data[8];
      colorType = chunk.data[9];
      if (chunk.data[12] !== 0) return undefined; // prokládání neumíme
    } else if (chunk.type === "PLTE") palette = chunk.data;
    else if (chunk.type === "IDAT") idat.push(chunk.data);
  }
  if (bitDepth !== 8 || width === 0 || height === 0) return undefined;

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (channels === 0) return undefined;
  if (colorType === 3 && palette === undefined) return undefined;

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const line = raw.subarray(position, position + stride);
    position += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? Buffer.alloc(stride) : pixels.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = prior[x];
      const upLeft = x >= channels ? prior[x - channels] : 0;
      const value = line[x];
      out[x] = filter === 0 ? value
        : filter === 1 ? (value + left) & 0xff
          : filter === 2 ? (value + up) & 0xff
            : filter === 3 ? (value + ((left + up) >> 1)) & 0xff
              : (value + paeth(left, up, upLeft)) & 0xff;
    }
  }

  const rgbAt = (x: number, y: number): [number, number, number] => {
    if (x < 0 || y < 0 || x >= width || y >= height) return [0, 0, 0];
    if (colorType === 3) {
      const index = pixels[y * stride + x];
      return [palette![index * 3], palette![index * 3 + 1], palette![index * 3 + 2]];
    }
    const at = y * stride + x * channels;
    if (colorType === 0 || colorType === 4) return [pixels[at], pixels[at], pixels[at]];
    return [pixels[at], pixels[at + 1], pixels[at + 2]];
  };

  return { width, height, rgbAt };
}
