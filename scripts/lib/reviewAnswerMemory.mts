/**
 * Paměť odpovědí na čtecích stránkách - jedna definice pro obě.
 *
 * ## Proč to musí vzniknout
 *
 * Draft ranží i flopové piloty se čtou po kouskách, mezi turnaji a v MHD.
 * Majitel 4. 9. 2026 řekl, jak to bude používat: stránky si dá na FTP a bude je
 * **vyplňovat postupně**. Stránka, která si odpověď nezapamatuje, se tak nedá
 * dočíst - a flopové piloty si do té chvíle nepamatovaly nic, zavřená karta
 * znamenala začít znovu.
 *
 * ## Proč je identifikátorem to, co se nemění
 *
 * Draft ranží paměť měl, ale **poziční**: ukládal se seznam podle pořadí na
 * stránce. Pořadí se ale s obsahem mění - draft se řadí podle dopadu, piloty
 * podle počtu pravidel - a půlka `--only=CHIP` má pořadí vlastní, přitom
 * sdílela týž klíč. Uložená odpověď by se proto po přegenerování nebo po
 * přepnutí půlky zaškrtla u cizí mřížky, a nepoznalo by se to: čísla by seděla,
 * jen by patřila jinam. To je táž vada jako v bodě 153, jen o vrstvu níž - tam
 * se opravil export, úložiště zůstalo poziční.
 *
 * Jménem pole je tady rovnou identifikátor záznamu (index v draftu, pořadí
 * pilota), takže mezi pozicí a identitou už není žádný převod, který by se mohl
 * rozejít.
 *
 * ## Proč se ukládá sloučeně
 *
 * Půlky draftu jsou dvě stránky nad jedním úložištěm. Kdyby se ukládalo jen to,
 * co je zrovna vidět, otevření druhé půlky by odpovědi té první přepsalo.
 * Odpovědi na mřížky, které dnešní stránka nevykresluje, se proto nesou dál
 * nedotčené a vyjedou i v exportu.
 *
 * ## Proč v emitovaném skriptu není jediné zpětné lomítko
 *
 * Skript se vkládá do šablonového řetězce a přesně tímhle se jednou tiše
 * rozbil: `\d` se cestou zkrátilo na `d`, výraz přestal sedět na jméno pole a
 * **neuložilo se nic** - stránka přitom vypadala v pořádku. Regulární výrazy tu
 * proto používají třídy znaků (`[0-9]`) a `ryeReviewForm.test.ts` hlídá, že se
 * lomítko do emitovaného skriptu nevrátí.
 */

export interface ReviewAnswerMemoryOptions {
  /**
   * Klíč v localStorage. Dva různé dokumenty musí mít různý, jinak si odpovědi
   * přepíšou; dvě půlky téhož dokumentu naopak stejný, aby na sebe viděly.
   */
  storageKey: string;
  /** Předpona tokenu, kterou čeká zapisovač odpovědí. */
  tokenPrefix: string;
  /**
   * Otisk obsahu, na který se odpovědi vážou, nebo `""` u stránky, která otisk
   * nemá. Když se obsah změní, uložené odpovědi se **nepřevezmou**: zaškrtnout
   * je nad jiným obsahem znamená tvrdit „přečteno" o něčem, co nikdo neviděl.
   */
  pageHash?: string;
  /**
   * Klíč starší, poziční paměti. Když se v prohlížeči najde, stránka to řekne -
   * a **nepřebírá ji**. Převod pozice na identitu se nedá ověřit a tiše
   * převzatá cizí odpověď je horší než ztracená odpověď.
   */
  legacyStorageKey?: string;
}

/** Lišta s průběhem a exportem. Drží se nahoře, ať je dosažitelná z každé mřížky. */
export function reviewAnswerBar(): string {
  return `<div class="bar">
  <span id="progress">hotovo <b>0</b> z ?</span>
  <button id="next">Další nezodpovězená</button>
  <button id="share" class="ghost">Zkopírovat odpovědi</button>
  <span id="storage-warning" hidden>Pozor: tenhle prohlížeč tu stránku neuloží.
    Odpovědi drží jen adresa - ulož si ji, nebo je průběžně kopíruj.</span>
  <span id="stale-warning" hidden>Obsah se od uložení odpovědí změnil, takže se
    nepřebírají - stránka je nová a chce přečíst znovu.</span>
  <span id="legacy-warning" hidden>Našly se odpovědi z předchozí verze stránky.
    Ukládaly se podle pozice, ne podle mřížky, takže je tahle verze nepřebírá -
    po přeskládání by sedly na cizí range. Když jsi v ní něco zodpověděl, ozvi se.</span>
</div>
<textarea id="export" hidden readonly></textarea>`;
}

/** Styly odpovídací části. Velké terče, ať to jde palcem v tramvaji. */
export const REVIEW_ANSWER_STYLES = `
 .bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
      padding:10px 12px;background:#0f141d;border-bottom:1px solid #2a3446}
 .bar b{color:#7bd3ff}
 .bar button{padding:9px 12px;border:0;border-radius:8px;background:#2f4a7a;color:#fff;
             font-size:13px;cursor:pointer;min-height:40px}
 .bar button.ghost{background:#1f2839;color:#cfe0f5}
 .bar span[id$="-warning"]{color:#ff8f6b;font-size:12px;max-width:460px}
 #export{width:100%;max-width:640px;height:110px;margin-top:8px;background:#0f141d;color:#cfe0f5;
         border:1px solid #2a3446;border-radius:8px;font:12px/1.4 ui-monospace,monospace;padding:8px}
 .verdict{margin-top:10px;padding:10px;background:#161d2b;border-radius:8px;max-width:640px}
 .q-focus{margin:0 0 6px;font-size:13px;color:#dce6f5}
 .q-hint{margin:0 0 6px;font-size:12px;color:#9fb3cd}
 .opts{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
 .opts--flags{margin-top:8px;padding-top:8px;border-top:1px solid #2a3446}
 .opt{display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;
      background:#1f2839;color:#cfe0f5;font-size:13px;cursor:pointer;user-select:none;min-height:40px}
 .opt input{width:16px;height:16px;margin:0}
 .opt:has(input:checked){background:#2f4a7a;color:#fff}
 .opt--flag:has(input:checked){background:#7a4a2f}
`;

/**
 * Jedna volba. Jméno pole nese **identitu záznamu**, ne jeho pozici na stránce.
 */
export function reviewAnswerOption(id: number, value: string, label: string): string {
  return `<label class="opt"><input type="radio" name="v${id}" value="${value}">`
    + `<span>${label}</span></label>`;
}

/** Výtka k odpovědi „nesedí". Táž identita, jiná předpona jména. */
export function reviewAnswerFlag(id: number, value: string, label: string): string {
  return `<label class="opt opt--flag"><input type="checkbox" name="f${id}" value="${value}">`
    + `<span>${label}</span></label>`;
}

/** Skript, který odpovědi drží. Bez zpětného lomítka - viz hlavička souboru. */
export function reviewAnswerScript(options: ReviewAnswerMemoryOptions): string {
  const { storageKey, tokenPrefix, pageHash = "", legacyStorageKey = "" } = options;
  return `<script>
(function () {
  var KEY = ${JSON.stringify(storageKey)};
  var PREFIX = ${JSON.stringify(tokenPrefix)};
  var HASH = ${JSON.stringify(pageHash)};
  var LEGACY = ${JSON.stringify(legacyStorageKey)};

  var blocks = document.querySelectorAll(".verdict");
  var ids = [];
  for (var b = 0; b < blocks.length; b += 1) ids.push(blocks[b].getAttribute("data-id"));

  // Odpovědi na záznamy, které tahle stránka nevykresluje. Nesou se dál, ať
  // druhá půlka draftu tu první nepřepíše.
  var carried = {};

  function codeFor(id) {
    var picked = document.querySelector('input[name="v' + id + '"]:checked');
    if (!picked) return "";
    var code = picked.value;
    var flags = document.querySelectorAll('input[name="f' + id + '"]:checked');
    for (var i = 0; i < flags.length; i += 1) code += flags[i].value;
    return code;
  }

  function body() {
    var all = {};
    for (var key in carried) if (carried.hasOwnProperty(key)) all[key] = carried[key];
    for (var i = 0; i < ids.length; i += 1) {
      var code = codeFor(ids[i]);
      if (code !== "") all[ids[i]] = code;
    }
    var keys = [];
    for (var name in all) if (all.hasOwnProperty(name)) keys.push(name);
    keys.sort(function (left, right) { return Number(left) - Number(right); });
    var parts = [];
    for (var k = 0; k < keys.length; k += 1) parts.push(keys[k] + all[keys[k]]);
    return parts;
  }

  function token() {
    var parts = body();
    if (parts.length === 0) return "";
    return PREFIX + " " + (HASH === "" ? "" : HASH + " ") + parts.join(" ");
  }

  function apply(parts) {
    for (var i = 0; i < parts.length; i += 1) {
      var match = /^([0-9]+)([ox?s])([1-5]*)$/.exec(parts[i]);
      if (match === null) continue;
      var radio = document.querySelector(
        'input[name="v' + match[1] + '"][value="' + match[2] + '"]'
      );
      if (radio === null) {
        // Záznam, který tahle stránka nevykresluje - odpověď se jen nese dál.
        carried[match[1]] = match[2] + match[3];
        continue;
      }
      radio.checked = true;
      for (var k = 0; k < match[3].length; k += 1) {
        var flag = document.querySelector(
          'input[name="f' + match[1] + '"][value="' + match[3].charAt(k) + '"]'
        );
        if (flag !== null) flag.checked = true;
      }
    }
  }

  function show(id) {
    var node = document.getElementById(id);
    if (node) node.hidden = false;
  }

  function refresh() {
    var done = 0;
    for (var i = 0; i < ids.length; i += 1) if (codeFor(ids[i]) !== "") done += 1;
    var extra = 0;
    for (var key in carried) if (carried.hasOwnProperty(key)) extra += 1;
    var counter = document.getElementById("progress");
    if (counter) {
      counter.innerHTML = "hotovo <b>" + done + "</b> z " + ids.length
        + (extra === 0 ? "" : " (+" + extra + " jinde v draftu)");
    }
    for (var b = 0; b < blocks.length; b += 1) {
      var picked = blocks[b].querySelector('input[type="radio"]:checked');
      var flags = blocks[b].querySelector(".opts--flags");
      if (flags) flags.hidden = !(picked && picked.value === "x");
    }
  }

  function save() {
    var text = (HASH === "" ? "" : HASH + " ") + body().join(" ");
    try { localStorage.setItem(KEY, text); } catch (error) { /* prohlížeč bez úložiště */ }
    // Fragment je záložní paměť: přežije i tam, kde úložiště nefunguje, a dá se
    // poslat jako odkaz. Mezera se v adrese píše jako tečka.
    if (history.replaceState) history.replaceState(null, "", "#v=" + text.split(" ").join("."));
    refresh();
  }

  // Úložiště se zkusí, ne předpokládá. Z lokálního souboru ho prohlížeč na
  // telefonu často nedovolí, a to se nesmí poznat až podle ztracené práce.
  function storageWorks() {
    try {
      localStorage.setItem(KEY + "-probe", "1");
      localStorage.removeItem(KEY + "-probe");
      return true;
    } catch (error) {
      return false;
    }
  }

  function load() {
    var fromHash = location.hash.indexOf("#v=") === 0 ? location.hash.slice(3) : "";
    var text = "";
    if (fromHash !== "") {
      text = fromHash;
    } else {
      try { text = localStorage.getItem(KEY) || ""; } catch (error) { text = ""; }
    }
    var parts = [];
    var raw = text.split(".").join(" ").split(" ");
    for (var i = 0; i < raw.length; i += 1) if (raw[i] !== "") parts.push(raw[i]);
    if (HASH !== "" && parts.length > 0) {
      var head = parts.shift();
      if (head !== HASH) {
        show("stale-warning");
        parts = [];
      }
    }
    apply(parts);
    if (!storageWorks()) show("storage-warning");
    if (LEGACY !== "") {
      var old = "";
      try { old = localStorage.getItem(LEGACY) || ""; } catch (error) { old = ""; }
      if (old !== "") show("legacy-warning");
    }
    refresh();
  }

  document.addEventListener("change", function (event) {
    var name = event.target && event.target.name;
    if (name && /^[vf][0-9]+$/.test(name)) save();
  });

  document.addEventListener("click", function (event) {
    var id = event.target && event.target.id;
    if (id === "next") {
      for (var i = 0; i < blocks.length; i += 1) {
        if (!blocks[i].querySelector('input[type="radio"]:checked')) {
          var section = blocks[i].closest ? blocks[i].closest("section") : null;
          (section || blocks[i]).scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      alert("Hotovo, všechno má odpověď.");
    }
    if (id === "share") {
      var box = document.getElementById("export");
      box.hidden = false;
      box.value = token();
      box.focus();
      box.select();
      try { document.execCommand("copy"); } catch (error) { /* stačí označené */ }
    }
  });

  load();
})();
</script>`;
}
