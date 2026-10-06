"""Odsolvit nastagované rodiny, dokud vydrží noční okno.

  python run_night_expansion.py [--until=HH:MM] [--limit=N] [--workers=N] [--river-workers=N] [--river-threads=N]

Sourozenec `run_night_decomposition.py`. Ten rozkládá existující checkpointy na
turnové a riverové podhry; tenhle vyrábí checkpointy, které ještě neexistují.

## Proč zvlášť, a proč vůbec

Trenažér se ptá na dvaatřicet vzorů pozic a rozklad jich drží pět, takže dvanáct
procent dotazů míří na spot, který vůbec máme. Prohlubovat těch pět dál ten poměr
nezmění - je potřeba odsolvit chybějící dvojice sedaček, a to je jiná práce než
rozklad: monolitický běh z parametrů, ne čtení hotového checkpointu.

Obě práce si berou celý stroj, takže se nedají spustit naráz. Který z nich patří
dnešní noc, rozhoduje `mtt:daily` podle měření a rozklad se podle toho sám
odsune.

## Změřeno na celé noci 20.-21. 8. 2026, a rozhoduje to o rozvrhu

**163 desek za jedno okno**: průměr 4,0 min na desku, medián 3,7, rozsah 0,8 až
9,1. Checkpointy 20-33 MB. Celé rozšíření tedy nejsou tři noci, jak stálo v
odhadu, ale jedna.

Odhad říkal 715 vteřin a stál na **jediné desce**; skutečnost je třikrát rychlejší.
Předtím tu bylo 148 vteřin, což bylo zase málo, protože se měřilo bez zápisu
dumpu. Dvě chybná čísla v řadě ze stejného důvodu: jedno měření není měření.

## Pojistky, které má i rozklad a ze stejných důvodů

Nezačne desku, kterou nestihne. Neběží mimo noční okno. Zastaví se, když dojde
místo. A je resumovatelný: deska s hotovým checkpointem se přeskočí, takže
přerušená noc stojí nejvýš jednu rozdělanou desku.

## Co dělá navíc

Spadlou desku zkusí podruhé a po druhém pádu ji odloží značkou `.failed`, aby ji
fronta přestala nabízet. A když frontu vyprázdní dřív, než skončí okno, **předá
zbytek noci rozkladu** - jinak by noc s krátkou frontou prostála.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SOLVER_ROOT = os.environ.get(
    "PKRTRAINER_TEXAS_SOLVER_ROOT",
    r"C:\Users\stachal\PKRTrainer\tools\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows",
)
PARAMS = os.path.join(
    REPO,
    "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters",
    "pkrtrainer_mtt_seat_pair_expansion_v1",
)
OUTPUT_BASE = os.path.join(
    REPO, "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver",
)

# Cena desky **tady nestojí**. Měří ji `npm run mtt:board-cost` z nočního logu
# a čte se z `board-cost.generated.json` (viz `board_cost()` níž).
#
# Do 6. 10. 2026 tu byl `BOARD_MINUTES = 12` a byl to nejčistší příznak toho,
# proč tahle vrstva vznikla: **nikdo ho nečetl.** Konstanta se dvakrát
# přeměřovala a opravovala (15 podle jediné desky, pak 12 podle noci z 20. na
# 21. 8.), žila v hlavě při každém plánování dávky - a v kódu nebyla ani jedna
# reference. Číslo, které se posouvá a přitom nic neovlivňuje, je horší než
# žádné: vypadá jako zdroj pravdy a není.
MIN_FREE_GB = 8
# O hodinu víc, než je okno. Od 10. 9. 2026 je okno 21:00-07:00, tedy deset
# hodin; guard má chytat spuštění mimo noc, ne noc samotnou.
MAX_WINDOW_HOURS = 11

# Kolikrát se deska zkusí, než se odloží natrvalo.
#
# Změřeno: 4 ze 177 desek spadly na `0xC0000005` (přístup do cizí paměti) po
# dvanácti vteřinách, a nespojuje je ani rodina, ani deska, ani šířka ranží -
# selhaly desky s 52 až 142 kombinacemi na užší straně, zatímco desky s 28
# prošly. Vypadá to na nahodilý pád solveru, takže druhý pokus stojí čtyři
# minuty a nejspíš desku zachrání.
#
# Značka o trvalém selhání je ta důležitější polovina: bez ní zůstane spadlá
# deska navždy „nastagovaná bez checkpointu", takže by jí rozklad každou noc
# znovu ustoupil - a noc by shořela na dvanácti vteřinách práce.
BOARD_ATTEMPTS = 2

# Žebřík pokusů pro desku, která spadla na čas (rozhodnutí vlastníka 3a,
# 1. 10. 2026): `(strop v minutách, přesnost)` pro každý stupeň.
#
# ## Z čeho to stojí
#
# `MTT9_25BB_CO_BTN_SRP` uvízla na 10/12: desky `J73r` a `T84r` dvakrát spadly
# na třicetiminutový strop a nesly `.failed`, takže je monolit už nenabídl -
# a protože deset desek ze dvanácti je menší obsah než dnešní pack, držela ta
# rodina starý obsah. Vlastník rozhodl zkusit je dráž, ne je vyřadit: jsou to
# suché rainbow flopy s J nebo T nahoře, tedy nejčastější textura, jakou
# rodina CO vs BTN potká.
#
# Opora, že nejsou rozbité, jen pomalé: v téže rodině na nových ranžích
# doběhly ostatní rainbow desky za 20,0 min (`742r`) a 23,2 min (`654r`), tedy
# těsně pod stropem. Tytéž dvě desky v jiných rodinách téže noci doběhly
# (`HJ_BTN` 18,6 a 18,9 min), na původních užších ranžích za 5,8 a 5,7 min.
#
# ## Proč je žebřík konečný
#
# Kdyby se spadlá deska zkoušela každou noc, vrátí se přesně ta škoda, proti
# které `.failed` vznikla: noc by hořela na desce, která nedoběhne. Proto má
# každá deska **tři stupně a dost** a po třetím pádu je odložená natrvalo.
#
# ## Žebřík přidává ke stropu, nenastavuje ho
#
# Do 6. 10. 2026 tu stála absolutní čísla - 30, 60, 60 - a platila pro každou
# hloubku. Na 25 bb to sedělo, na 40 bb ne: první noc na 40 bb (5.-6. 10.)
# naměřila na 19 deskách **medián 19,3 min, maximum 29,1** a **dvě desky přes
# třicet**, tedy 11 % okna zahozených na stropu, který byl těsný. Žebřík proto
# přidává minuty k **základnímu stropu podle hloubky**: pro 25 bb z toho vyjde
# přesně vlastníkových 30 / 60 / 60 s přesností 1 % (rozhodnutí 3a), pro 40 bb
# 60 / 90 / 90.
ESCALATION = ((0, 0.5), (30, 0.5), (30, 1.0))

# Strop a rezerva se **čtou z měření**, ne odsud: `board-cost.generated.json`
# drží na každou hloubku jeden změřený řádek a tři odvozená čísla. Jak se
# odvozují a proč nejde udělat jedna konstanta pro všechny tři, je rozepsané
# v `scripts/lib/boardCost.mts`.
BOARD_COST_PATH = os.path.join(
    REPO, "Agents/solver-input/decomposition/board-cost.generated.json",
)

# Poslední známá dobrá tabulka, **jen pro případ, že se soubor nepřečte**.
#
# Runner kvůli chybějící ceně padnout nesmí: spadlý runner stojí celou noc,
# kdežto o něco vedle padnoucí strop stojí jednu desku. Proto se tady drží kopie
# a hlásí se to do logu - opačná volba (zavřená brána) patří hlídači, ne noci.
# Čísla jsou ta, která z měření 6. 10. 2026 vyšla, takže záloha a měření si
# neodporují.
FALLBACK_CAP_MINUTES = ((25, 30), (40, 60), (50, 90))
FALLBACK_RESERVE_MINUTES = ((25, 14), (40, 29), (50, 59))
# Nad devadesát minut se nejde: deska, která potřebuje víc, není deska, je to
# noc. Strop se nad 60 nezvedá u 25 bb, jak vlastník výslovně uvedl; u hlubších
# je tohle tentýž úsudek o rozpočtu, jen na jiné základně.
CAP_CEILING_MINUTES = 90
DEEPEST_KNOWN_CAP = 90
# Hlubší než 50 bb nemá smysl rezervovat **méně** než 50 bb: 100 bb je podle
# generátoru dávky přes 2,5 h na desku.
DEEPEST_KNOWN_RESERVE = 60

_COST_CACHE = {}


def board_cost():
    """Změřená tabulka ceny desky jako `{hloubka: řádek}`, nebo prázdno.

    Čte se **jednou** a do logu se o tom řekne, ať je v nočním záznamu vidět,
    podle čeho noc jela. Prázdný výsledek znamená „ber zálohu", ne „nula minut".
    """
    if "rows" in _COST_CACHE:
        return _COST_CACHE["rows"]
    rows = {}
    try:
        with open(BOARD_COST_PATH, encoding="utf-8") as handle:
            table = json.load(handle)
        for row in table.get("depths", []):
            rows[int(row["depthBB"])] = row
        log(f"cena desky změřena {table.get('measuredAt', '?')}"
            f" na {table.get('solves', '?')} deskách: "
            + ", ".join(f"{depth} bb {row['planMinutes']} min"
                        f"{'' if row.get('basis') == 'měřeno' else ' (extrapolace)'}"
                        for depth, row in sorted(rows.items())))
    except Exception as problem:  # noqa: BLE001 - noc nesmí padnout kvůli tabulce
        log(f"POZOR: cenu desky se přečíst nepodařilo ({problem}); "
            "beru poslední známou zálohu v runneru")
        rows = {}
    _COST_CACHE["rows"] = rows
    return rows


def depth_of(family: str) -> int:
    """Hloubka ze jména rodiny, `MTT9_40BB_UTG_2_HJ_SRP` → 40; 0 když to nejde."""
    found = re.search(r"_(\d+)BB_", family)
    return int(found.group(1)) if found else 0


def _by_depth(table, depth: int, fallback: int) -> int:
    for limit, value in table:
        if depth <= limit:
            return value
    return fallback


def _measured(family: str, key: str):
    """Hodnota z měření pro hloubku té rodiny, nebo `None`."""
    row = board_cost().get(depth_of(family))
    return None if row is None else row.get(key)


def caps_for(family: str, level: int):
    """`(strop v minutách, přesnost)` pro danou rodinu a stupeň žebříku."""
    base = _measured(family, "capMinutes")
    if base is None:
        base = _by_depth(FALLBACK_CAP_MINUTES, depth_of(family), DEEPEST_KNOWN_CAP)
    extra, accuracy = ESCALATION[level]
    return (min(base + extra, CAP_CEILING_MINUTES), accuracy)


def reserve_for(family: str) -> int:
    """Kolik minut nechat před deadlinem, aby se čerstvá deska ještě vešla."""
    reserve = _measured(family, "reserveMinutes")
    if reserve is None:
        reserve = _by_depth(FALLBACK_RESERVE_MINUTES, depth_of(family), DEEPEST_KNOWN_RESERVE)
    return int(reserve)


def failure_level(checkpoint: str) -> int:
    """Kolikrát už deska spadla. 0 = čerstvá, `len(ESCALATION)` = došly stupně.

    Značky z doby před žebříkem (30. 9. 2026) stupeň neuvádějí; čtou se jako
    první pád, takže dostanou 60minutový pokus, ne nekonečno.
    """
    marker = checkpoint + ".failed"
    if not os.path.exists(marker):
        return 0
    try:
        with open(marker, encoding="utf-8") as handle:
            found = re.search(r"stupen=(\d+)", handle.read())
        return int(found.group(1)) if found else 1
    except OSError:
        return 1


def param_for_level(param: str, level: int, checkpoint: str) -> str:
    """Parametry pro daný stupeň; jiná přesnost znamená kopii vedle checkpointu.

    Původní soubor se nepřepisuje: přesnost je vlastnost **pokusu**, ne desky,
    a příští generování parametrů by změnu stejně smazalo. Kopie nese
    `dump_result` beze změny, takže checkpoint vzniká na svém místě.

    ## Proč kopie nesmí ležet v `PARAMS`

    Tam ji `pending_boards()` přečte jako **další desku**. Vzor na jméno bere za
    desku všechno za poslední podtržítkou, takže z `..._J73r.stupen2.txt` vyjde
    deska `J73r.stupen2`, její checkpoint nikdy neexistuje - a fronta ji nabízí
    každou noc navždy. To je přesně ta škoda, proti které `.failed` vznikla.
    Kopie proto jde do adresáře checkpointu, který generátor parametrů nečte.
    """
    accuracy = ESCALATION[level][1]
    if accuracy == ESCALATION[0][1]:
        return param
    with open(param, encoding="utf-8") as handle:
        text = handle.read()
    swapped = re.sub(r"^set_accuracy .*$", f"set_accuracy {accuracy}", text, flags=re.M)
    copy = f"{checkpoint}.stupen{level}.params.txt"
    with open(copy, "w", encoding="utf-8") as handle:
        handle.write(swapped)
    return copy


def log(message: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {message}", flush=True)


def free_gb() -> float:
    return shutil.disk_usage(REPO).free / (1024 ** 3)


def power_source():
    """Na síti, nebo na baterii? Vrací (zdroj, procenta baterie).

    ## Proč to tu je

    Noc 1.-2. 10. 2026 přišla o **8 hodin 21 minut**: v 23:15:51 stroj usnul
    a probudil se v 7:36:50. Systémový log uvádí důvod bez obalu - `Důvod
    spánku: Battery`. Notebook nebyl v zásuvce, baterie došla a Windows uspaly
    stroj, aby neztratily data. Noc místo asi pětatřiceti desek udělala
    čtrnáct.

    `keep_system_awake` proti tomu nepomůže a pomoct nemůže: `PowerSetRequest`
    říká „tenhle proces musí běžet dál", ne „nevypínej se, i když dojde
    proud". Stejně tak nepomůže nastavení víka a nečinnosti - to všechno
    wrappery nastavují **pro napájení ze sítě** (`ACSettingIndex`), a když
    stroj na síti není, platí hodnoty pro baterii.

    Běh se kvůli baterii nezastavuje: pár desek je lepší než žádná. Ale musí
    to být v logu, protože do 2. 10. 2026 noc o spánku mlčela a každý tik
    hlásil „na síti: neuspávat nečinností" - věta, která zní jako záruka,
    a přitom o skutečném zdroji napájení neříká nic.
    """
    if os.name != "nt":
        return ("unknown", -1)
    try:
        import ctypes

        class SystemPowerStatus(ctypes.Structure):
            _fields_ = [
                ("ACLineStatus", ctypes.c_ubyte),
                ("BatteryFlag", ctypes.c_ubyte),
                ("BatteryLifePercent", ctypes.c_ubyte),
                ("SystemStatusFlag", ctypes.c_ubyte),
                ("BatteryLifeTime", ctypes.c_ulong),
                ("BatteryFullLifeTime", ctypes.c_ulong),
            ]

        status = SystemPowerStatus()
        if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(status)):
            return ("unknown", -1)
        source = {0: "baterie", 1: "síť"}.get(status.ACLineStatus, "unknown")
        percent = status.BatteryLifePercent
        return (source, percent if percent <= 100 else -1)
    except Exception:
        return ("unknown", -1)


def pending_boards():
    """Nastagované desky bez checkpointu, v pořadí, v jakém je generátor zapsal.

    To pořadí není náhodné: generátor řadí podle změřené poptávky trenažéru,
    takže první odsolvené jsou ty, které nejdřív někdo uvidí.
    """
    if not os.path.isdir(PARAMS):
        return []
    fresh, retries = [], []
    for name in sorted(os.listdir(PARAMS)):
        if not name.endswith(".txt"):
            continue
        stem = re.sub(r"^\d+_", "", name[:-4])
        match = re.match(r"(MTT9_\d+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_([^_]+)$", stem)
        if match is None:
            continue
        family, board = match.group(1), match.group(2)
        checkpoint = os.path.join(OUTPUT_BASE, family, "raw", f"pkrtrainer_{family}_{board}.json")
        if os.path.exists(checkpoint) and os.path.getsize(checkpoint) > 0:
            continue
        entry = (os.path.join(PARAMS, name), family, board, checkpoint)
        level = failure_level(checkpoint)
        if level == 0:
            fresh.append(entry + (0,))
        elif level < len(ESCALATION):
            # Spadlá deska se zkusí znovu, ale **až po** všech čerstvých a jen
            # tolikrát, kolik má žebřík stupňů (rozhodnutí vlastníka 3a).
            retries.append(entry + (level,))
    return fresh + retries


def solved(checkpoint: str) -> bool:
    """Hotovost se pozná podle souboru, ne podle návratového kódu.

    Solver vrací nulu i tehdy, když nic nezapsal - to už jednou stálo za tím, že
    se useknuté běhy počítaly jako hotová práce.
    """
    return os.path.exists(checkpoint) and os.path.getsize(checkpoint) > 0


def main():
    # Výchozí konec je konec okna. Od 10. 9. 2026 je to sedmá, ne osmá.
    until = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--until=")), "07:00")
    limit = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--limit=")), "0"))

    hour, minute = (int(x) for x in until.split(":"))
    deadline = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    if deadline <= datetime.now():
        deadline += timedelta(days=1)
    window = (deadline - datetime.now()).total_seconds() / 3600
    if window > MAX_WINDOW_HOURS and "--force" not in sys.argv:
        log(
            f"okno by trvalo {window:.1f} h, což je víc než {MAX_WINDOW_HOURS} - "
            "běh se pravděpodobně spouští mimo noc. Spusť po 21:00, nebo přidej --force."
        )
        return

    todo = pending_boards()
    log(f"nastagováno {len(todo)} desek bez checkpointu; deadline {until}")
    log(f"na disku volno {free_gb():.1f} GB (hranice {MIN_FREE_GB} GB)")
    if not todo:
        log("není co solvit; vygeneruj parametry přes npm run mtt:seat-pair-expansion -- --write")
        return

    # Držet stroj vzhůru po celé okno - stejně jako rozklad, a ze stejného
    # důvodu. Tenhle runner to do 14. 9. 2026 neuměl: expanzní noci byly od
    # 1. 9. krátké (10 desek), takže se to neprojevilo; s frontou 174 desek
    # (`mtt:board-growth`) je to celá noc a Modern Standby by ji sebral
    # uprostřed monolitu, jako 30. 8. rozkladu.
    from run_night_decomposition import keep_system_awake
    awake = keep_system_awake(True)
    log("stroj se drží vzhůru po dobu běhu" if awake
        else "POZOR: stroj se nedaří udržet vzhůru; okno může přerušit spánek")

    source, percent = power_source()
    if source == "síť":
        log("napájení: síť")
    else:
        log(f"POZOR: napájení je {source}"
            + (f" ({percent} %)" if percent >= 0 else "")
            + " - víko a nečinnost se nastavují pro síť, takže na baterii "
            "neplatí a Windows uspí stroj, až baterie dojde. Noc 1.-2. 10. 2026 "
            "tím přišla o 8 h 21 min. Solvit se bude dál, ale okno není jisté.")

    done = failed = 0
    slept_minutes = 0.0
    for param, family, board, checkpoint, level in (todo[:limit] if limit else todo):
        cap_minutes, accuracy = caps_for(family, level)
        remaining = (deadline - datetime.now()).total_seconds() / 60
        if remaining <= 0:
            log("deadline; končím mezi deskami")
            break
        # Čerstvá deska potřebuje typicky medián své hloubky, takže stačí
        # rezerva podle `RESERVE_MINUTES`. Opakovaný pokus má smysl jen celý -
        # usekne-li ho deadline, je to zahozená hodina, takže se mu rezervuje
        # celý jeho strop.
        need = cap_minutes if level > 0 else reserve_for(family)
        if remaining < need:
            log(f"končím {remaining:.0f} min před deadline: "
                f"{'opakovaný pokus' if level > 0 else 'deska'} potřebuje asi {need}")
            break
        available = free_gb()
        if available < MIN_FREE_GB:
            log(f"končím: na disku zbývá {available:.1f} GB")
            break

        os.makedirs(os.path.dirname(checkpoint), exist_ok=True)
        if level > 0:
            log(f"solving {family} {board} (stupeň {level}: strop {cap_minutes} min, "
                f"přesnost {accuracy} %)")
            param = param_for_level(param, level, checkpoint)
        else:
            log(f"solving {family} {board}")
        for attempt in range(1, BOARD_ATTEMPTS + 1):
            started = time.time()
            # Timeout je selhání desky, ne noci. V noci na 15. 9. 2026 běžela
            # `MTT9_25BB_BTN_SB_SRP J73r` přes třicet minut, `TimeoutExpired`
            # nikdo nechytil a runner spadl v 01:48 - zbylých pět hodin okna
            # (asi 35 desek) shořelo a rozklad okno nedostal. Deska, která
            # timeout přesáhne jednou, ho přesáhne i podruhé (solver je
            # deterministický), takže se neopakuje a rovnou se odloží.
            try:
                result = subprocess.run(
                    [os.path.join(SOLVER_ROOT, "console_solver.exe"), "-i", param],
                    cwd=SOLVER_ROOT, capture_output=True, text=True,
                    timeout=cap_minutes * 60,
                )
                rc = result.returncode
            except subprocess.TimeoutExpired:
                rc = "timeout"
                attempt = BOARD_ATTEMPTS
            minutes = (time.time() - started) / 60
            # Stroj mezi tím spal, deska nebyla pomalá.
            #
            # Proces se vešel do stropu - `subprocess.run` nevyhodil
            # `TimeoutExpired` - a přesto na hodinách uběhlo víc, než kolik
            # strop dovoluje. To nejde, pokud se hodiny nepohnuly bez procesu,
            # tedy pokud stroj nespal. Žádné API na to není potřeba a žádné by
            # nebylo spolehlivější: `time.monotonic()` se na Windows u Modern
            # Standby chová různě, kdežto tahle nesrovnalost je logická.
            #
            # Noc 1.-2. 10. 2026 bez tohohle rozlišení ohlásila „hotovo za
            # 507.5 min" u desky, která běžela šest minut a pak osm hodin spala.
            # Řádek se čte jako extrémně pomalý solve, a byla to ztracená noc.
            overslept = rc != "timeout" and minutes > cap_minutes + 2
            if overslept:
                # Dolní mez, ne přesný čas: kolik z těch minut deska opravdu
                # solvila, se zvenčí zjistit nedá.
                slept_minutes += minutes - cap_minutes
            if solved(checkpoint):
                size = os.path.getsize(checkpoint) / (1024 ** 2)
                done += 1
                # Úspěch **uklízí značku po pádu**. Bez tohohle zůstala ležet
                # vedle hotového checkpointu a dál se čte jako fakt: desky
                # `J73r` a `T84r` v `MTT9_25BB_CO_BTN_SRP` dosolvily 5. 10. 2026
                # (46 MB, kolem 46 min každá), a jejich značky z 30. 9. tam
                # ležely i 6. 10. Vlastníkovi se kvůli nim pořád nabízelo
                # rozhodnutí o rodině, která už byla 12/12, a každý konzument
                # značek musel zvlášť ověřovat, že checkpoint přece existuje.
                marker = checkpoint + ".failed"
                if os.path.exists(marker):
                    try:
                        os.remove(marker)
                        log("  (uklizena značka po dřívějším pádu)")
                    except OSError as problem:
                        log(f"  POZOR: značku po pádu nejde smazat ({problem})")
                again = "" if attempt == 1 else " (napodruhé)"
                if overslept:
                    log(f"  hotovo, ale stroj mezi tím SPAL: na hodinách "
                        f"{minutes:.1f} min při stropu {cap_minutes}, "
                        f"checkpoint {size:.0f} MB{again}")
                else:
                    log(f"  hotovo za {minutes:.1f} min, checkpoint {size:.0f} MB{again}")
                break
            if attempt < BOARD_ATTEMPTS:
                log(f"  spadlo po {minutes:.1f} min (rc={rc}); zkouším znovu")
                continue
            # Pád při spánku není pád desky. Stroj ji usekl uprostřed, takže to
            # nebyl poctivý pokus - stupeň se nespotřebuje a deska zůstane ve
            # frontě tak, jak byla. Bez tohohle by jedna noc na baterii odložila
            # natrvalo každou desku, kterou zastihla.
            if overslept:
                log(f"  nedokončeno, protože stroj SPAL: na hodinách "
                    f"{minutes:.1f} min při stropu {cap_minutes}; "
                    "stupeň se nespotřebovává, deska zůstává ve frontě")
                break
            failed += 1
            next_level = level + 1
            with open(checkpoint + ".failed", "w", encoding="utf-8") as handle:
                handle.write(f"{datetime.now():%Y-%m-%d %H:%M} rc={rc} "
                             f"po {attempt} pokusech stupen={next_level}\n")
            if next_level < len(ESCALATION):
                next_cap, next_accuracy = caps_for(family, next_level)
                log(f"  SELHALO po {minutes:.1f} min (rc={rc}); příští noc "
                    f"stupeň {next_level} - strop {next_cap} min, přesnost {next_accuracy} %")
            else:
                log(f"  SELHALO po {minutes:.1f} min (rc={rc}); žebříček vyčerpán "
                    f"({len(ESCALATION)} stupně), odloženo natrvalo - "
                    "rozhodnutí o rodině je na vlastníkovi")
            break

    log(f"expansion: hotovo {done}, selhalo {failed}, zbývá {len(pending_boards())}")
    # Ztracený čas se hlásí zvlášť od práce. Bez tohohle řádku vypadá noc
    # 1.-2. 10. 2026 jako „hotovo 14, selhalo 0" - tedy jako úspěch, kterým
    # nebyla: osm hodin okna prospala a čtrnáct desek je třetina běžné noci.
    if slept_minutes > 0:
        log(f"POZOR: stroj během okna spal aspoň {slept_minutes / 60:.1f} h "
            f"(napájení: {power_source()[0]}). Tolik práce noc neudělala.")
    # Pustit, než okno převezme rozklad: ten si drží vzhůru sám.
    keep_system_awake(False)
    hand_back(deadline)


def hand_back(deadline) -> None:
    """Zbytek okna předá rozkladu, když fronta došla.

    Bez tohohle by noc s krátkou frontou shořela: čtrnáct desek je hodina a okno
    má jedenáct. Rozklad si vlastní podmínky vyhodnotí sám a ustoupit už nemá
    komu - fronta je prázdná, takže to není kruh.
    """
    remaining = (deadline - datetime.now()).total_seconds() / 60
    if pending_boards():
        log("fronta není prázdná, rozkladu okno nepředávám")
        return
    if remaining < 60:
        log(f"zbývá {remaining:.0f} min, na rozklad je to málo; končím")
        return
    log(f"fronta prázdná, {remaining / 60:.1f} h okna předávám rozkladu")
    # Tvar rozkladu se předává dál, ne vymýšlí tady: bez toho by předaná
    # půlka noci jela riverovou fázi 8 x 2 místo 16 x 1 z naplánované úlohy
    # rozkladu (bod 242), a obě půlky noci by měly jinou propustnost.
    forwarded = [a for a in sys.argv if a.startswith(("--workers=", "--river-workers=", "--river-threads="))]
    subprocess.run(
        [sys.executable, os.path.join(HERE, "run_night_decomposition.py"),
         f"--until={deadline:%H:%M}", *forwarded],
        cwd=REPO,
    )


if __name__ == "__main__":
    main()
