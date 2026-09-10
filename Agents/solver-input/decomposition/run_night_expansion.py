"""Odsolvit nastagované rodiny, dokud vydrží noční okno.

  python run_night_expansion.py [--until=HH:MM] [--limit=N]

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

# Naměřeno na 163 deskách za noc 20.-21. 8. 2026: průměr 4,0 min, medián 3,7,
# maximum 9,1. Dřív tu stálo 15 podle jediného měření (715 s), a bylo to skoro
# čtyřnásobek - noc kvůli tomu skončila 13 minut před deadlinem, přestože se
# ještě tři desky vešly. Dvanáct je maximum plus rezerva; deska, která se
# nestihne, znamená zahozený solve, ne uložený mezivýsledek.
BOARD_MINUTES = 12
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


def log(message: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {message}", flush=True)


def free_gb() -> float:
    return shutil.disk_usage(REPO).free / (1024 ** 3)


def pending_boards():
    """Nastagované desky bez checkpointu, v pořadí, v jakém je generátor zapsal.

    To pořadí není náhodné: generátor řadí podle změřené poptávky trenažéru,
    takže první odsolvené jsou ty, které nejdřív někdo uvidí.
    """
    if not os.path.isdir(PARAMS):
        return []
    todo = []
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
        # Deska, která opakovaně spadla, není čekající práce. Bez tohohle by ji
        # fronta nabízela navždy a rozklad by jí každou noc ustupoval do prázdna.
        if os.path.exists(checkpoint + ".failed"):
            continue
        todo.append((os.path.join(PARAMS, name), family, board, checkpoint))
    return todo


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

    done = failed = 0
    for param, family, board, checkpoint in (todo[:limit] if limit else todo):
        remaining = (deadline - datetime.now()).total_seconds() / 60
        if remaining <= 0:
            log("deadline; končím mezi deskami")
            break
        if remaining < BOARD_MINUTES:
            log(f"končím {remaining:.0f} min před deadline: deska potřebuje asi {BOARD_MINUTES}")
            break
        available = free_gb()
        if available < MIN_FREE_GB:
            log(f"končím: na disku zbývá {available:.1f} GB")
            break

        os.makedirs(os.path.dirname(checkpoint), exist_ok=True)
        log(f"solving {family} {board}")
        for attempt in range(1, BOARD_ATTEMPTS + 1):
            started = time.time()
            result = subprocess.run(
                [os.path.join(SOLVER_ROOT, "console_solver.exe"), "-i", param],
                cwd=SOLVER_ROOT, capture_output=True, text=True,
                timeout=max(BOARD_MINUTES, 30) * 60,
            )
            minutes = (time.time() - started) / 60
            if solved(checkpoint):
                size = os.path.getsize(checkpoint) / (1024 ** 2)
                done += 1
                again = "" if attempt == 1 else " (napodruhé)"
                log(f"  hotovo za {minutes:.1f} min, checkpoint {size:.0f} MB{again}")
                break
            if attempt < BOARD_ATTEMPTS:
                log(f"  spadlo po {minutes:.1f} min (rc={result.returncode}); zkouším znovu")
                continue
            failed += 1
            with open(checkpoint + ".failed", "w", encoding="utf-8") as handle:
                handle.write(f"{datetime.now():%Y-%m-%d %H:%M} rc={result.returncode} "
                             f"po {BOARD_ATTEMPTS} pokusech\n")
            log(f"  SELHALO po {BOARD_ATTEMPTS} pokusech (rc={result.returncode}); "
                "odloženo natrvalo, smaž .failed pro další pokus")

    log(f"expansion: hotovo {done}, selhalo {failed}, zbývá {len(pending_boards())}")
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
    subprocess.run(
        [sys.executable, os.path.join(HERE, "run_night_decomposition.py"),
         f"--until={deadline:%H:%M}"],
        cwd=REPO,
    )


if __name__ == "__main__":
    main()
