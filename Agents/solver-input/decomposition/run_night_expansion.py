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

## Změřeno 20. 8. 2026, a rozhoduje to o rozvrhu

Jedna deska na 25 blindech trvá **715 vteřin** včetně zápisu dumpu a dá checkpoint
o 31 MB, commit paměti kolem 1,7 GB. Do jedenáctihodinového okna se tedy vejde
kolem padesáti desek a celé rozšíření - 174 desek - jsou zhruba tři noci.

Dřívější měření tvrdilo 148 vteřin, ale to bylo bez zápisu dumpu, protože
tehdejší parametry ho posílaly relativní cestou do kořene solveru. Číslo vypadalo
věrohodně a bylo neúplné; proto je tady napsané to správné i s tím, co ho drží.

## Pojistky, které má i rozklad a ze stejných důvodů

Nezačne desku, kterou nestihne. Neběží mimo noční okno. Zastaví se, když dojde
místo. A je resumovatelný: deska s hotovým checkpointem se přeskočí, takže
přerušená noc stojí nejvýš jednu rozdělanou desku.
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

# Naměřeno: 715 s na desku. Patnáct minut je ta hodnota s rezervou - deska, která
# se nestihne, znamená zahozený solve, ne uložený mezivýsledek.
BOARD_MINUTES = 15
MIN_FREE_GB = 8
MAX_WINDOW_HOURS = 12


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
        todo.append((os.path.join(PARAMS, name), family, board, checkpoint))
    return todo


def main():
    until = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--until=")), "08:00")
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
        started = time.time()
        result = subprocess.run(
            [os.path.join(SOLVER_ROOT, "console_solver.exe"), "-i", param],
            cwd=SOLVER_ROOT, capture_output=True, text=True,
            timeout=max(BOARD_MINUTES, 30) * 60,
        )
        minutes = (time.time() - started) / 60
        # Hotovost se pozná podle souboru, ne podle návratového kódu: solver vrací
        # nulu i tehdy, když nic nezapsal.
        if os.path.exists(checkpoint) and os.path.getsize(checkpoint) > 0:
            size = os.path.getsize(checkpoint) / (1024 ** 2)
            done += 1
            log(f"  hotovo za {minutes:.1f} min, checkpoint {size:.0f} MB")
        else:
            failed += 1
            log(f"  SELHALO po {minutes:.1f} min (rc={result.returncode}), checkpoint nevznikl")

    log(f"expansion: hotovo {done}, selhalo {failed}, zbývá {len(pending_boards())}")


if __name__ == "__main__":
    main()
