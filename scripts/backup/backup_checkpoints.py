"""Záloha monolitických checkpointů do podsložky repozitáře (rozhodnutí D7).

  python scripts/backup/backup_checkpoints.py [--target=DIR] [--dry-run] [--force]
  python scripts/backup/backup_checkpoints.py --restore [--target=DIR]

## Proč

Checkpointy jsou jediná data, která se bez nocí znovu vyrobit nedají: ztráta
stroje 30. 10. 2026 vzala všechny (deník 328) a s nimi i možnost znovu rozložit
desky, které záloha rozkladu neměla (bod 331). Majitel 3. 11. 2026: záloha do
podsložky v DrillEV. Mimo stroj ji dostává sám - stejně jako archivy rozkladu
z `archive-by-family.sh`, ze kterých se 2. 11. obnovovalo.

## Jak

Každý checkpoint zvlášť jako `<cíl>/<rodina>/<soubor>.json.gz`. Přírůstkově:
balí se jen nový soubor, nebo novější než jeho záloha (záloha nese čas zdroje).
Atomicky: do `.part` a přejmenovat, takže přerušený běh nenechá rozbitou zálohu,
kterou by příští běh vzal za hotovou. Po souborech, ne po rodinách: rodina
dostává desky několik nocí a balík celé rodiny by se kvůli jedné desce
přebaloval a znovu nahrával.

## Kdy ne

V okně solveru (po-pá 20:00-07:00 a celý víkend) se nebalí. Archivace vedle
solveru prodloužila 14. 10. 2026 desky o 13 % (`archive-by-family.sh`). Spouští
ji ranní tik noční úlohy mimo okno (`night-expansion.ps1`); `--force` jen
vědomě.
"""
import gzip
import os
import shutil
import sys
from datetime import datetime

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUTPUT_BASE = os.path.join(REPO, "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver")
DEFAULT_TARGET = os.path.join(REPO, "zaloha", "checkpointy")


def log(message: str) -> None:
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {message}", flush=True)


def solver_window(now: datetime) -> bool:
    """Patří tahle chvíle solveru? Po-pá 20:00-07:00 a celý víkend (majitel 2. 11. 2026)."""
    if now.weekday() >= 5:
        return True
    return now.hour >= 20 or now.hour < 7


def checkpoints(output_base: str):
    """`(rodina, cesta)` každého neprázdného checkpointu, seřazeně."""
    if not os.path.isdir(output_base):
        return []
    found = []
    for family in sorted(os.listdir(output_base)):
        raw = os.path.join(output_base, family, "raw")
        if not os.path.isdir(raw):
            continue
        for name in sorted(os.listdir(raw)):
            path = os.path.join(raw, name)
            if name.startswith("pkrtrainer_") and name.endswith(".json") and os.path.getsize(path) > 0:
                found.append((family, path))
    return found


def is_current(source: str, backup: str) -> bool:
    """Má checkpoint zálohu z téhož času? Záloha nese čas zdroje (`os.utime`)."""
    if not os.path.exists(backup) or os.path.getsize(backup) == 0:
        return False
    return abs(os.path.getmtime(backup) - os.path.getmtime(source)) < 2


def backup(output_base: str, target: str, dry_run: bool = False) -> dict:
    """Zabalí nové a změněné checkpointy; vrací počty a velikosti."""
    stats = {"packed": 0, "current": 0, "sourceBytes": 0, "packedBytes": 0}
    for family, source in checkpoints(output_base):
        destination = os.path.join(target, family, os.path.basename(source) + ".gz")
        if is_current(source, destination):
            stats["current"] += 1
            continue
        stats["packed"] += 1
        stats["sourceBytes"] += os.path.getsize(source)
        if dry_run:
            continue
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        part = destination + ".part"
        with open(source, "rb") as reader, gzip.open(part, "wb", compresslevel=6) as writer:
            shutil.copyfileobj(reader, writer, 1024 * 1024)
        os.replace(part, destination)
        moment = os.stat(source)
        os.utime(destination, (moment.st_atime, moment.st_mtime))
        stats["packedBytes"] += os.path.getsize(destination)
    return stats


def restore(output_base: str, target: str) -> int:
    """Rozbalí zálohy, ke kterým checkpoint chybí. Existující checkpoint nepřepíše."""
    restored = 0
    if not os.path.isdir(target):
        return 0
    for family in sorted(os.listdir(target)):
        folder = os.path.join(target, family)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.endswith(".json.gz"):
                continue
            destination = os.path.join(output_base, family, "raw", name[:-3])
            if os.path.exists(destination) and os.path.getsize(destination) > 0:
                continue
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            part = destination + ".part"
            with gzip.open(os.path.join(folder, name), "rb") as reader, open(part, "wb") as writer:
                shutil.copyfileobj(reader, writer, 1024 * 1024)
            os.replace(part, destination)
            restored += 1
    return restored


def main() -> int:
    target = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--target=")), DEFAULT_TARGET)
    if "--restore" in sys.argv:
        log(f"obnova checkpointů ze {target}: rozbaleno {restore(OUTPUT_BASE, target)}")
        return 0
    if solver_window(datetime.now()) and "--force" not in sys.argv:
        log("okno solveru (po-pá 20-07, víkend), nebalím - balení vedle solveru zdražuje desky")
        return 0
    dry_run = "--dry-run" in sys.argv
    stats = backup(OUTPUT_BASE, target, dry_run)
    megabytes = 1024 * 1024
    log(f"záloha checkpointů{' (nanečisto)' if dry_run else ''}: zabaleno {stats['packed']} "
        f"({stats['sourceBytes'] / megabytes:.0f} MB"
        + ("" if dry_run else f" -> {stats['packedBytes'] / megabytes:.0f} MB")
        + f"), beze změny {stats['current']}, cíl {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
