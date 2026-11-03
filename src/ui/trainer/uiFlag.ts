/**
 * Přepínač nového GUI tréninku (Agents/ui-redesign-plan.md, fáze 1).
 *
 * Od 3. 11. 2026 je nové GUI výchozí: prošlo E2E na všech šířkách, preflop
 * i postflop včetně linky (krok 3c) a matice range. Staré zůstává po ruce:
 * `?ui=classic` ho vrátí, `?ui=next` zase nové, a volba se pamatuje, aby šla
 * změnit i v nainstalované aplikaci, kde adresu nikdo nepíše. Kdo si dřív
 * klasiku výslovně zvolil (uloženo „0“), tomu zůstane.
 */
export const NEXT_UI_STORAGE_KEY = "pkrtrainer.ui.next.v1";

export function isNextUiEnabled(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const requested = new URLSearchParams(search).get("ui");
  if (requested === "next" || requested === "classic") {
    try {
      storage?.setItem(NEXT_UI_STORAGE_KEY, requested === "next" ? "1" : "0");
    } catch {
      // Bez úložiště platí volba aspoň pro tohle načtení.
    }
    return requested === "next";
  }
  try {
    return storage?.getItem(NEXT_UI_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}
