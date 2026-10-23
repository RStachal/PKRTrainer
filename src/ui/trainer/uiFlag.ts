/**
 * Přepínač nového GUI tréninku (Agents/ui-redesign-plan.md, fáze 1).
 *
 * Nové GUI zůstává za přepínačem, dokud neprojde E2E na všech šířkách.
 * `?ui=next` ho zapne, `?ui=classic` vypne, a volba se pamatuje, aby šla
 * vyzkoušet i v nainstalované aplikaci, kde adresu nikdo nepíše.
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
    return storage?.getItem(NEXT_UI_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
