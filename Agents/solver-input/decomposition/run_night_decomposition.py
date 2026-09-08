"""Decompose as many solved boards as the night allows, board after board.

Every board with a monolithic checkpoint can have its turn nodes re-solved at the
richer action set - two bet sizes, two raise sizes and a shove on both streets -
because each subgame is under a gigabyte where the monolith needs 25.9 GB. There
are 577 such boards, so this is not a job that finishes; it is a job that makes
progress and stops when told.

  python run_night_decomposition.py [--until=HH:MM] [--workers=N] [--coverage=0.99]
                                    [--river-budget=N]

Design notes worth keeping:

- It is resumable at every level. A board whose plan and outputs already exist is
  skipped in seconds, so an interrupted night costs nothing but the board in
  flight.
- Half-finished boards are taken before anything else, then boards deepest-first. This was the other way until the first full
  night measured what shallowest-first produced: more boards, but over half their
  turn nodes offering only check-or-shove, because a low SPR leaves no room for a
  second sizing. Throughput was the wrong thing to maximise.
- It stops at the deadline rather than mid-board where it can, because a
  half-planned board is the one state that needs re-reading a 395 MB dump. It
  will not *start* a board it does not expect to finish in time, either, which is
  what `--until` originally failed to mean: gating only the start let a board
  begun nine minutes before the deadline run half an hour past it.
- Zbytek okna po vyčerpané turnové frontě patří riveru. `--river-budget` zůstává
  ruční pákou, ale bez něj se river nespouští jen dokud turn něco má; jakmile
  fronta dojde, dostane river ocas noci a konec určí deadline. Nula napořád by
  znamenala, že třetí noc spálí osm jader na tom, že nemá co dělat.

Stopping it early takes three steps, in order, because the children outlive the
parent on Windows: kill this driver, then the `solve_plan.py` it launched, then
`console_solver.exe`. Killing only the driver leaves solve_plan orphaned and still
spawning solvers, which looks exactly like solvers that refuse to die - taskkill
reports success on each one and the count stays where it was.
"""
import io
import json
from collections import defaultdict
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))

# Nejdelší okno, které se ještě bere jako noční běh, v hodinách.
#
# Dvanáct, ne jedenáct. Okno je dnes 21:00-08:00, tedy přesně jedenáct hodin, a
# proti stropu jedenáct by o celé noci rozhodovaly zlomky vteřiny mezi spuštěním
# úlohy a načtením skriptu. Guard má chytat spuštění mimo noc - devátou ranní,
# která dá okno dvacet dva hodin - a to chytá dvanáctka stejně dobře.
MAX_WINDOW_HOURS = 12

# Kolik místa na disku musí zbývat, aby se pustila další deska, v gigabajtech.
#
# Solver na plný disk nereaguje chybou, kterou by šlo přečíst: zapíše, co se
# vejde. Výsledek je useknutý soubor, a ten je horší než chybějící, protože
# vypadá jako hotová práce. Osm gigabajtů je s rezervou: deska stojí kolem 34 MB,
# ale číst se k ní musí monolitický checkpoint o 395 MB, a Windows na skoro plném
# systémovém disku dělá vlastní problémy.
MIN_FREE_GB = 8
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUTPUT_BASE = os.path.join(REPO, "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver")
PARAM_ROOT = os.path.join(REPO, "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters")
WORK = os.path.join(REPO, "artifacts/decomposition")


def free_gb() -> float:
    """Volné místo na svazku, kam se rozklad zapisuje."""
    return shutil.disk_usage(WORK if os.path.isdir(WORK) else REPO).free / (1024 ** 3)


def log(message: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


NIGHT_PRIORITY = os.path.join(REPO, "Agents", "daily", "tonight.json")
"""Nastagované parametry, ze kterých se počítá čekající práce.

Je to **ta dávka, kterou monolitický runner doopravdy bere**, ne celý adresář s
parametry. Dokud se počítal celý, hlásil rozklad čekající práci i za dávky, do
kterých se expanze nikdy nepodívá - a ustupoval by kvůli nim na celou noc. Dnes
je taková deska jedna (`MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR 872r` z dávky
`growth_board_review`), takže to nic nezpůsobilo; kdyby jich zbyly poslední tři,
způsobilo by to prostátou noc.
"""
STAGED_PARAMS = os.path.join(
    REPO, "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters",
    "pkrtrainer_mtt_seat_pair_expansion_v1",
)


def staged_families_without_checkpoint():
    """Rodiny, které mají nastagované parametry a žádný odsolvený board.

    To je ta práce, kvůli které má smysl ustoupit. Kdyby se ustoupilo do
    prázdna, noc by nepřinesla nic - a to je horší než prohlubovat tam, kde už
    odpověď je.
    """
    pending = set()
    if not os.path.isdir(STAGED_PARAMS):
        return pending
    for base, _dirs, files in os.walk(STAGED_PARAMS):
        for name in files:
            if not name.endswith(".txt"):
                continue
            stem = re.sub(r"^\d+_", "", name[:-4])
            match = re.match(r"(MTT9_\d+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_[^_]+$", stem)
            if match is None:
                continue
            family = match.group(1)
            # Soubory, ne adresář. Generátor parametrů `raw/` zakládá prázdný,
            # aby do něj solver měl kam psát - takže existence adresáře o
            # checkpointu neříká nic a tahle kontrola by tvrdila, že rodina je
            # hotová, dokud by ji nikdo neodsolvil.
            raw = os.path.join(OUTPUT_BASE, family, "raw")
            solved = os.path.isdir(raw) and any(
                name.endswith(".json") for name in os.listdir(raw)
            )
            if not solved:
                pending.add(family)
    return pending


def monolithic_runner_installed():
    """Je vedle úloha, která to okno umí převzít?

    Bez tohohle by se ustupovalo do prázdna. Priorita říká, která práce je
    cennější - ne že se má stroj v noci vypnout, když ta cennější není čím
    spustit.
    """
    # `PKRTrainer-Night-Expansion` je ten, který dnes tu práci doopravdy dělá;
    # ostatní dvě jsou starší cesty k témuž oknu. Chybět tu nesmí ani jedna:
    # kdyby seznam nesouhlasil s tím, co je nainstalované, rozklad by neustoupil
    # a nastagovaná práce by čekala další noc.
    for task in (
        "PKRTrainer-Night-Expansion",
        "PKRTrainer-Weekend-UniformResolve",
        "PKRTrainer-TexasSolver-Autostart",
    ):
        try:
            result = subprocess.run(
                ["schtasks", "/query", "/tn", task],
                capture_output=True, text=True, timeout=30,
            )
        except Exception:
            continue
        if result.returncode == 0 and "Ready" in result.stdout:
            return True
    return False


# Kolik desek musí čekat, aby se vyplatilo ustoupit na celé okno.
#
# Původně odvozeno z jediného měření 715 s na desku. Skutečnost za noc 20.-21. 8.
# 2026 na 163 deskách: **průměr 4,0 min**, takže osm desek je půl hodiny, ne dvě.
# Práh přesto zůstává nízký, protože expanze od té noci **zbytek okna vrací**
# rozkladu, jakmile jí dojde fronta - ustoupit kvůli hodině práce už tedy
# neznamená prostát deset hodin.
YIELD_MIN_BOARDS = 8


def staged_boards_without_checkpoint():
    """Kolik nastagovaných desek ještě nemá checkpoint."""
    count = 0
    if not os.path.isdir(STAGED_PARAMS):
        return count
    for base, _dirs, files in os.walk(STAGED_PARAMS):
        for name in files:
            if not name.endswith(".txt"):
                continue
            stem = re.sub(r"^\d+_", "", name[:-4])
            match = re.match(r"(MTT9_\d+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_([^_]+)$", stem)
            if match is None:
                continue
            family, board = match.group(1), match.group(2)
            checkpoint = os.path.join(
                OUTPUT_BASE, family, "raw", f"pkrtrainer_{family}_{board}.json",
            )
            # Deska odložená natrvalo není čekající práce. Bez tohohle by
            # jediný opakovaný pád solveru držel prioritu NEW_FAMILIES navždy:
            # rozklad by ustupoval každou noc a expanze by tu desku pokaždé
            # přeskočila, takže by noc shořela na dvanácti vteřinách.
            if not os.path.exists(checkpoint) and not os.path.exists(checkpoint + ".failed"):
                count += 1
    return count


def refresh_night_priority():
    """Nechat denní vyhodnocení rozhodnout, co má tahle noc dělat.

    ## Proč to musí spustit noc sama

    Priorita se čte ze souboru, který zapisuje `npm run mtt:daily`. Ten ale
    **není naplánovaný** - spouštěl ho člověk. Změřeno 1. 9. 2026: soubor měl
    datum **23. 8. v 9:03**, tedy devět dní starý, a noc podle něj devět nocí
    prohlubovala river. Denní zápisy končí týmž dnem.

    Rozhodovací vrstva tím fakticky přestala existovat a zůstala jen vykonávací:
    stroj běžel, ale nikdo mu neříkal kam. Nejlevnější oprava, která se nemůže
    rozejít znovu, je nechat to spustit noc - v tu chvíli je vyhodnocení čerstvé
    z definice.

    Selhání se **nepřenáší dál**: když vyhodnocení spadne, noc pokračuje podle
    toho, co v souboru je. Prázdná noc kvůli nefunkční poradě je horší než noc
    podle starší rady.
    """
    started = time.time()
    try:
        result = subprocess.run(
            ["npm", "run", "mtt:daily", "--", "--write"],
            cwd=REPO, capture_output=True, text=True, shell=True,
            timeout=DAILY_TIMEOUT_SECONDS,
        )
    except Exception as error:
        log(f"denní vyhodnocení se nepodařilo spustit ({error}); jedu podle uloženého")
        return
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()[-300:]
        log(f"denní vyhodnocení skončilo rc={result.returncode}; jedu podle uloženého. {detail}")
        return
    for line in (result.stdout or "").splitlines():
        if "DOPORUČENÍ" in line or "priorita pro noc" in line:
            log(f"  {line.strip()}")
    log(f"denní vyhodnocení hotové za {time.time() - started:.0f} s")


def should_yield_to_new_families():
    """Hláška o ustoupení, nebo `None` když se má rozkládat.

    Ustoupí se jen tehdy, když to priorita říká **a zároveň** je vedle co
    spustit. Priorita bez nastagované práce znamená, že se má rozkládat dál:
    prázdná noc nikomu nepomůže.
    """
    if not os.path.exists(NIGHT_PRIORITY):
        return None
    try:
        with open(NIGHT_PRIORITY, encoding="utf8") as handle:
            decision = json.load(handle)
    except Exception:
        return None
    if decision.get("priority") != "NEW_FAMILIES":
        return None
    pending = staged_families_without_checkpoint()
    if not pending:
        return None
    boards = staged_boards_without_checkpoint()
    if boards < YIELD_MIN_BOARDS:
        # Ustoupit na celou noc kvůli hodině práce je horší než neustoupit
        # vůbec: zbytek okna by stál prázdný. Naměřeno 715 s na desku, takže
        # osm desek jsou zhruba dvě hodiny - pod tím se to nevyplatí.
        return None
    if not monolithic_runner_installed():
        # Ustoupit do prázdna je horší než prohlubovat tam, kde už odpověď je:
        # noc by neodvedla vůbec nic. Priorita říká, co je cennější, ne že se má
        # stroj vypnout.
        return None
    return (
        f"ustupuji: priorita je NEW_FAMILIES ({decision.get('reason', 'bez důvodu')}), "
        f"nastagováno {len(pending)} rodin bez checkpointu. "
        "Okno patří monolitickému solveru, rozklad by mu vzal stroj."
    )


# Kolik smí běh přetáhnout deadline, než ho rodič ukončí.
#
# Deadline dosud hlídalo jen dítě, a to **před spuštěním další podhry**. Běžící
# podhra doběhne, na to je uvnitř strop 1800 s. Jenže noc z 24. na 25. 8.
# přetáhla o **66 minut**, tedy o dvojnásobek toho stropu: vrstva začatá v 07:33
# běžela 92 minut a stihla 40 ze 108 podher. Proč strop nedržel, se z logu
# zjistit nedá - rodič výstup dítěte zahazuje.
#
# Příčinu tedy neznám a nebudu ji předstírat. Posouvám mez tam, kam patří:
# **okno vlastní rodič, tak ho vynutí rodič**. Pět minut je prostor, aby
# rozdělané podhry doběhly čistě; zabít běh je bezpečné, protože se píše do
# `.part` a pod finální jméno jde až ověřený výsledek.
OVERRUN_GRACE_MINUTES = 5


def layer_timeout_seconds(deadline, now=None):
    """Kolik vteřin smí jedna vrstva ještě běžet, než ji rodič ukončí."""
    remaining = (deadline - (now or datetime.now())).total_seconds()
    return max(60.0, remaining + OVERRUN_GRACE_MINUTES * 60)


# Kolik nejvýš smí trvat denní vyhodnocení, než se noc rozjede bez něj.
DAILY_TIMEOUT_SECONDS = 600

# Jak dlouho se po zabití čeká, než se strom solverů uklidí, ve vteřinách.
LAYER_KILL_GRACE_SECONDS = 30

# Po jak dlouhých krocích se kontroluje **hodinový** čas.
#
# Musí to být krátký krok, protože jediné, k čemu je: po probuzení stroje
# poznat, že deadline mezitím uplynul. Minuta je dost jemná a přitom to nestojí
# nic - kontrola je jedno porovnání.
DEADLINE_POLL_SECONDS = 60


def keep_system_awake(enable, _state={}):
    """Držet stroj vzhůru po dobu solvení. Vrací True, když se to povedlo.

    ## Proč to tu je

    Naměřeno 30. 8. 2026: stroj usnul uprostřed riverové vrstvy a probudil se
    až o 31 hodin později. Dvě noci tím přišly vniveč.

    ## Proč to podruhé nestačilo

    První oprava použila `SetThreadExecutionState`. Ta drží **klasický** spánek,
    ne Modern Standby - a tenhle stroj používá právě ten; systémový log mluví
    o „moderním úsporném režimu". Změřeno 1. 9. 2026: běh ohlásil, že se drží
    vzhůru, poslední dump se zapsal v 07:55:55, stroj šel do úsporného režimu
    v 07:55:56 a další zápis přišel až v 09:51 - **dvě hodiny okna pryč**.

    Správná cesta pro Modern Standby je `PowerSetRequest` s
    `PowerRequestExecutionRequired`: ta říká „tenhle proces musí běžet dál",
    kdežto `ES_SYSTEM_REQUIRED` jen „nezhasínej systém". Starší mechanismus
    zůstává jako záloha pro stroje bez Modern Standby.
    """
    if os.name != "nt":
        return False
    try:
        import ctypes
        from ctypes import wintypes

        ES_CONTINUOUS = 0x80000000
        ES_SYSTEM_REQUIRED = 0x00000001
        kernel32 = ctypes.windll.kernel32

        # Záloha: drží klasický spánek. Sama nestačí, ale nic nestojí.
        kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED if enable else ES_CONTINUOUS
        )

        if not enable:
            handle = _state.pop("power_request", None)
            if handle is None:
                return True
            kernel32.PowerClearRequest(handle, 3)  # PowerRequestExecutionRequired
            kernel32.CloseHandle(handle)
            return True

        class REASON_CONTEXT_DETAIL(ctypes.Structure):
            _fields_ = [
                ("LocalizedReasonModule", wintypes.HMODULE),
                ("LocalizedReasonId", wintypes.ULONG),
                ("ReasonStringCount", wintypes.ULONG),
                ("ReasonStrings", ctypes.POINTER(wintypes.LPWSTR)),
            ]

        class REASON_CONTEXT(ctypes.Structure):
            _fields_ = [
                ("Version", wintypes.ULONG),
                ("Flags", wintypes.DWORD),
                ("Reason", REASON_CONTEXT_DETAIL),
            ]

        POWER_REQUEST_CONTEXT_SIMPLE_STRING = 0x00000001
        reason = ctypes.create_unicode_buffer("PKRTrainer noční solving")
        context = REASON_CONTEXT()
        context.Version = 0
        context.Flags = POWER_REQUEST_CONTEXT_SIMPLE_STRING
        # `SimpleReasonString` leží v unii na začátku detailu.
        ctypes.memmove(
            ctypes.byref(context.Reason),
            ctypes.byref(ctypes.c_void_p(ctypes.addressof(reason))),
            ctypes.sizeof(ctypes.c_void_p),
        )

        kernel32.PowerCreateRequest.restype = wintypes.HANDLE
        handle = kernel32.PowerCreateRequest(ctypes.byref(context))
        if not handle or handle == wintypes.HANDLE(-1).value:
            return False
        # 3 = PowerRequestExecutionRequired: proces musí běžet i v Modern Standby.
        if not kernel32.PowerSetRequest(handle, 3):
            kernel32.CloseHandle(handle)
            return False
        _state["power_request"] = handle
        return True
    except Exception:
        return False

def keep_child_output(out_dir, name, output):
    """Uložit výstup dítěte, aby příští přesah nezůstal bez důkazů.

    Dosud běželo `capture_output=True` a výsledek se zahazoval, takže po
    šestašedesátiminutovém přesahu nebylo z čeho zjistit, co dítě dělalo.
    """
    if not output:
        return
    try:
        with io.open(os.path.join(out_dir, name), "w", encoding="utf8") as handle:
            handle.write(output[-200000:])
    except OSError:
        pass


def run_solve_plan(plan_path, out_dir, workers, deadline):
    """Odsolvit jednu vrstvu a vrátit okno rodiči, jakmile deadline vyprší.

    Vrací True, když dítě doběhlo samo, False, když ho ukončil rodič.
    """
    command = [
        # `-u` je tu kvůli důkazům, ne kvůli rychlosti. S bufferovaným stdoutem
        # zabité dítě neodevzdá nic - naměřeno: kill vyšel, log měl 0 B - a to
        # je přesně ten stav, kvůli kterému se příčina minulého přesahu
        # nedala zjistit.
        sys.executable, "-u", os.path.join(HERE, "solve_plan.py"),
        plan_path, out_dir, f"--workers={workers}",
        f"--deadline={deadline.timestamp()}",
    ]
    child = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    # Čeká se po minutách a po každé se kouká na **hodiny**, ne na uplynulý čas.
    #
    # Monotonický timeout během spánku stroje stojí, takže by přesah nepoznal:
    # 29. 8. 2026 vrstva takhle běžela 1 866 minut místo dvaačtyřiceti. Hodinová
    # kontrola to zachytí do minuty po probuzení.
    limit = time.time() + layer_timeout_seconds(deadline)
    output = None
    timed_out = False
    stalled = 0.0
    last_tick = time.time()
    while True:
        try:
            output, _ = child.communicate(timeout=DEADLINE_POLL_SECONDS)
            break
        except subprocess.TimeoutExpired:
            # Kolik času stroj prostál.
            #
            # Tahle smyčka se probouzí každou minutu. Když od posledního
            # probuzení uplynulo mnohem víc, nebyl to výpočet - byl to spánek
            # nebo úsporný režim, ve kterém procesy stojí. Naměřeno 2. 9. 2026:
            # noc přišla o 54 minut a poznalo se to až z windowsího event logu.
            # Ztráta, kterou nikdo nevidí, se neopraví.
            now = time.time()
            gap = now - last_tick
            if gap > DEADLINE_POLL_SECONDS * 3:
                stalled += gap
            last_tick = now
            if now >= limit:
                timed_out = True
                break
    if stalled > 60:
        log(f"    POZOR: stroj během vrstvy stál {stalled / 60:.0f} min (spánek nebo úsporný režim)")
    if timed_out:
        # Zabít samotné `child` nestačí: solvery jsou jeho vnoučata a na Windows
        # rodiče přežijí, takže by okno držely dál a přesah by trval stejně.
        # `taskkill /T` bere celý strom - je to tentýž postup, který popisuje
        # docstring modulu pro ruční zastavení.
        subprocess.run(
            ["taskkill", "/T", "/F", "/PID", str(child.pid)],
            capture_output=True, text=True,
        )
        try:
            output, _ = child.communicate(timeout=LAYER_KILL_GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            child.kill()
            output = ""
        keep_child_output(out_dir, "solve_plan.timeout.log", output)
        log(f"    vrstvu ukončil rodič na deadlinu; výstup v {out_dir}")
        return False
    if child.returncode != 0:
        keep_child_output(out_dir, "solve_plan.failed.log", output)
        log(f"    solve_plan skončil rc={child.returncode}; výstup v {out_dir}")
    return True


def board_parameter_files():
    """Every board that has a monolithic checkpoint, with the parameters it used."""
    found = {}
    for root, _dirs, files in os.walk(PARAM_ROOT):
        for name in files:
            if not name.endswith(".txt"):
                continue
            stem = re.sub(r"^\d+_", "", name[:-4])
            if "_" not in stem:
                continue
            family, board = stem.rsplit("_", 1)
            checkpoint = os.path.join(OUTPUT_BASE, family, "raw", f"pkrtrainer_{family}_{board}.json")
            if os.path.exists(checkpoint):
                found.setdefault((family, board), os.path.join(root, name))
    return found


def read_parameters(path: str):
    text = open(path, encoding="utf8", errors="replace").read()
    pot = re.search(r"set_pot\s+([\d.]+)", text)
    stack = re.search(r"set_effective_stack\s+([\d.]+)", text)
    board = re.search(r"set_board\s+([^\r\n]+)", text)
    if pot is None or stack is None or board is None:
        return None
    return float(pot.group(1)), float(stack.group(1)), board.group(1).strip()


def main():
    until = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--until=")), "08:45")
    workers = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--workers=")), "8")
    coverage = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--coverage=")), "0.99")
    # Riverová vrstva je vypnutá, dokud se nezadá rozpočet. Zapnutá naslepo by
    # spolkla celé okno turnové fázi, a nedokončený turn blokuje review bránu.
    river_budget = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--river-budget=")), "0"))

    hour, minute = (int(x) for x in until.split(":"))
    deadline = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    if deadline <= datetime.now():
        deadline += timedelta(days=1)

    # Okno se nesmí natáhnout na celý den.
    #
    # `--until=07:00` spuštěné ve 21:00 dá deset hodin, ale spuštěné v 08:00 dá
    # dvacet tři - a běh pak drží osm jader přes celou pracovní dobu. Přesně to
    # se stalo: log má poslední zápisy v 08:19, hodinu po zamýšleném konci, a
    # kontrola deadlinu u každé desky proti tomu nepomůže, protože deadline sám
    # byl špatně. Solvení patří do noci; spuštění mimo ni je skoro vždy omyl.
    window_hours = (deadline - datetime.now()).total_seconds() / 3600
    if window_hours > MAX_WINDOW_HOURS and "--force" not in sys.argv:
        log(
            f"okno by trvalo {window_hours:.1f} h (do {deadline:%d.%m. %H:%M}), což je víc než "
            f"{MAX_WINDOW_HOURS} h - běh se pravděpodobně spouští mimo noční okno. "
            "Buď spusť po 21:00, nebo přidej --force."
        )
        return

    os.makedirs(WORK, exist_ok=True)
    # Držet stroj vzhůru po celé okno. Bez toho usne uprostřed vrstvy a okno se
    # promarní: 29. 8. 2026 takhle přišly vniveč dvě noci po sobě.
    # Nejdřív porada, potom práce. Devět nocí se solvilo podle rady z 23. 8.,
    # protože ji nikdo neaktualizoval - viz `refresh_night_priority`.
    refresh_night_priority()
    awake = keep_system_awake(True)
    log(f"na disku volno {free_gb():.1f} GB (hranice pro další desku je {MIN_FREE_GB} GB)")
    log("stroj se drží vzhůru po dobu běhu" if awake
        else "POZOR: stroj se nedaří udržet vzhůru; okno může přerušit spánek")

    # Priorita z denního vyhodnocení, ne z pravidla v tomhle souboru.
    #
    # Noc umí dvě práce a nemůže obě naráz, protože každá si vezme celý stroj:
    # rozkládat existující checkpointy, nebo monoliticky odsolvit nové rodiny.
    # Tenhle runner rozhodoval sám podle pravidla "turn napřed, pak river" - a
    # to bylo správné, dokud turn chyběl. Po jeho dokončení pokračoval v riveru a
    # dvě noci prohluboval pět dvojic sedaček, zatímco trenažér se ptá na
    # dvaatřicet vzorů. Rozhodnutí proto přichází zvenčí, z měření.
    yielded = should_yield_to_new_families()
    if yielded is not None:
        log(yielded)
        return
    boards = board_parameter_files()

    def depth(key):
        match = re.search(r"MTT9_(\d+)BB", key[0])
        return int(match.group(1)) if match else 999

    # Deepest first, reversing the original choice on evidence. Shallowest-first
    # finished more boards per hour, and the first full night showed why that was
    # the wrong thing to maximise: of the 22,842 subgames it produced, 12,397 turn
    # nodes offered only two actions. At 20 to 35BB a flop bet and call leaves an
    # SPR under one, so nothing fits between a small bet and the stack and the tree
    # collapses to check-or-shove. Those nodes are correct and nearly free of
    # information. The ones worth having - two bet sizes, two raise sizes, a shove
    # that is a real choice - exist only where the stack is deep, and those were
    # exactly the boards the old ordering left until last.
    def partially_done(key):
        """How far a board already is: 0 untouched, 1 finished, between if partial.

        A board left half solved is wasted work until it is finished, and
        finishing it costs less than starting a fresh one. It also unblocks the
        review gate at family level: MTT9_40BB_UTG_BB_SRP sat at 2,010 of 2,152
        subgames because a single board stopped at 38 of 180, and one incomplete
        board blocks the whole family whatever the other twelve did.
        """
        out_dir = os.path.join(WORK, f"{key[0]}__{key[1]}")
        plan_path = os.path.join(out_dir, "plan.json")
        if not os.path.exists(plan_path):
            return 0.0
        try:
            planned = len(json.load(open(plan_path, encoding="utf8"))["items"])
        except Exception:
            return 0.0
        if planned == 0:
            return 0.0
        solved = len([f for f in os.listdir(out_dir)
                      if f.endswith(".json") and f != "plan.json"])
        return solved / planned

    def priority(key):
        progress = partially_done(key)
        # Started but unfinished goes first, least-finished within that, then the
        # deepest untouched boards as before. A finished board sorts with the
        # untouched ones and is skipped seconds later either way.
        started = 0 < progress < 1
        return (0 if started else 1, progress if started else 0, -depth(key), key[0], key[1])

    ordered = sorted(boards, key=priority)
    log(f"{len(ordered)} boards have a monolithic checkpoint; deadline {deadline:%H:%M}")

    done = skipped = failed = 0
    # How long a board has been taking, so the deadline can mean what it says.
    # `--until` used to gate only the start of a board, and a board is 20 to 30
    # minutes: a board begun at 07:51 ran until past 08:20, holding eight cores
    # through the first half hour of the working day. Now a board is only started
    # if it is expected to finish in time, using the measured duration of the
    # boards already done this run rather than a guess.
    board_minutes = []
    # Jestli fronta došla, nebo ji zastavil deadline. Tohle rozhoduje, co dělá
    # zbytek noci: vyčerpaná fronta znamená volné okno pro river, zastavená
    # znamená, že turn má co dělat a přednost si drží.
    turn_exhausted = True
    for family, board in ordered:
        remaining = (deadline - datetime.now()).total_seconds() / 60
        if remaining <= 0:
            log("deadline reached; stopping between boards")
            turn_exhausted = False
            break
        available = free_gb()
        if available < MIN_FREE_GB:
            # Zastavit mezi deskami je jediné místo, kde plný disk nic nestojí.
            # Uprostřed desky by solver zapsal, co se vejde, a useknutý dump
            # vypadá jako hotová práce.
            log(
                f"stopping: na disku zbývá {available:.1f} GB, což je pod hranicí "
                f"{MIN_FREE_GB} GB. Další deska by se nemusela dopsat celá."
            )
            turn_exhausted = False
            break
        if board_minutes:
            expected = max(board_minutes)
            if expected > remaining:
                log(
                    f"stopping {remaining:.0f} min before the deadline: the next board "
                    f"needs about {expected:.0f} min and would overrun it"
                )
                turn_exhausted = False
                break

        out_dir = os.path.join(WORK, f"{family}__{board}")
        plan_path = os.path.join(out_dir, "plan.json")
        os.makedirs(out_dir, exist_ok=True)

        parameters = read_parameters(boards[(family, board)])
        if parameters is None:
            log(f"SKIP {family} {board}: cannot read pot/stack/board")
            skipped += 1
            continue
        pot, stack, board_cards = parameters

        if not os.path.exists(plan_path):
            checkpoint = os.path.join(OUTPUT_BASE, family, "raw", f"pkrtrainer_{family}_{board}.json")
            log(f"planning {family} {board} ({board_cards}, pot {pot:.0f}, stack {stack:.0f})")
            result = subprocess.run(
                [sys.executable, os.path.join(HERE, "plan_board.py"),
                 checkpoint, board_cards, str(pot), str(stack), plan_path, coverage],
                capture_output=True, text=True,
            )
            if result.returncode != 0 or not os.path.exists(plan_path):
                # Návratový kód a obě roury, ne jen poslední řádek stderru.
                #
                # Původní hlášení tisklo `stderr.splitlines()[-1:] or stdout[-200:]`,
                # což pro proces zabitý bez výstupu vypsalo prázdný seznam - a
                # jedna noc tak spálila 119 desek na řádcích "plan failed: " bez
                # jediného vodítka. Plánovač přitom na týchž datech ručně projde,
                # takže příčina byla v prostředí a přesně to zahozený návratový
                # kód říct uměl.
                detail = (result.stderr.strip() or result.stdout.strip() or "žádný výstup")
                if not os.path.exists(checkpoint):
                    detail = f"chybí checkpoint {checkpoint}"
                elif result.returncode == 0:
                    detail = f"plán se nezapsal do {plan_path}; {detail}"
                log(f"  plan failed (rc={result.returncode}): {detail[-400:]}")
                failed += 1
                continue

        planned = len(json.load(open(plan_path, encoding="utf8"))["items"])
        solved = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
        if solved >= planned:
            skipped += 1
            continue

        log(f"solving {family} {board}: {planned - solved} of {planned} subgames left")
        started = time.time()
        finished = run_solve_plan(plan_path, out_dir, workers, deadline)
        after = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
        minutes = (time.time() - started) / 60
        log(f"  {after}/{planned} after {minutes:.1f} min")
        board_minutes.append(minutes)
        done += 1
        if not finished:
            log("  deadline reached; board phase ukončena rodičem")
            break

    log(f"boards worked {done}, already complete {skipped}, failed {failed}")

    remaining = (deadline - datetime.now()).total_seconds() / 60
    # Kolik desek s checkpointem je rozložených. Bez toho by se river pouštěl
    # jen po úplně vyčerpané frontě, což při dlouhém ocase nenastane dlouho.
    decomposed = len([
        name for name in (os.listdir(WORK) if os.path.isdir(WORK) else [])
        if "__" in name and os.path.exists(os.path.join(WORK, name, "plan.json"))
    ])
    turn_coverage = decomposed / len(boards) if boards else 0.0
    budget = river_budget_for(river_budget, turn_exhausted, remaining, turn_coverage)
    if budget is None:
        log(f"river phase: turnová fronta vyčerpaná, zbývá {remaining:.0f} min okna")
        run_river_phase(deadline, workers, coverage, None)
    elif budget > 0:
        run_river_phase(deadline, workers, coverage, budget)
    elif not turn_exhausted:
        log(
            "river phase se nespouští: turn není hotový "
            f"({turn_coverage * 100:.0f} % desek) a má přednost"
        )


# Kolik okna musí zbývat, aby mělo smysl začínat další riverovou vrstvu.
#
# Nahradilo odhad `max(layer_minutes) > remaining`, který vrstvu odmítal začít,
# dokud nezbývalo tolik, kolik trvala nejdelší dosud viděná. Měření za 505
# vrstev ukazuje, proč to nemohlo fungovat: **délka vrstvy kolísá 28×** (medián
# 3,3 min, maximum 92,2), protože položek na vrstvu je 148 až 407. Po jediné
# dlouhé vrstvě by tedy brzda proidlila půldruhé hodiny každé noci.
#
# Odhadovat se to nemá čím zlepšit a hlavně už není potřeba: přetažení dnes
# tvrdě omezuje dvojice mezí (položka končí do `deadline + 4 min`, rodič zabíjí
# na `deadline + 5 min`), a useknutá vrstva není ztráta - položky se ukládají po
# jedné a příští noc se pokračuje. Ta 92minutová vrstva odevzdala 40 podher.
#
# Zbývá jediný důvod nezačínat: samotné `plan_river.py` něco stojí a plán bez
# jediné odsolvené položky je čistá režie. Pět minut je na plán a pár položek.
RIVER_MIN_LAYER_START_MIN = 5


# Kratší zbytek okna river nespouští: samotné plánování vrstvy něco stojí a
# nedoplánovaná vrstva není poloviční výsledek, ale žádný.
RIVER_MIN_WINDOW_MIN = 10


# Podíl rozložených turnových desek, od kterého se river pouští i s nedodělaným
# turnem. Zdůvodnění je v `river_budget_for`.
RIVER_TURN_COVERAGE_FLOOR = 0.9


def river_budget_for(explicit, turn_exhausted, remaining_minutes, turn_coverage=0.0):
    """Kolik turnových podher dostane riverovou vrstvu. `None` znamená kolik stihne.

    Pořadí „turn napřed" bylo správné, dokud turn chyběl po celých rodinách:
    nedokončená rodina se zasekne na review bráně, kdežto chybějící river
    neblokuje nic. Při 81 % rozložených desek to platilo.

    Při 93 % už ne, a je to změřené, ne odhadnuté. Turnu zbývá 41 desek ve třech
    rodinách, z nichž dvě se už dodávají - je to tedy širší pokrytí u obsahu,
    který hráč dostane i tak. Riverovou vrstvu má proti tomu **jedna turnová
    podhra z 2 318** a sedmnáct rodin z osmnácti nemá river vůbec. Mezní hodnota
    poslední turnové desky je tím pádem malá a mezní hodnota první riverové
    vrstvy v rodině velká.

    River se proto pouští, když turnová fronta došla **nebo** když je turn nad
    devadesáti procenty. Ta hranice je volba, ne měření: je to bod, za kterým už
    zbytek turnu je dlouhý ocas jednotlivých desek, ne chybějící rodiny.
    Přednost turnu tím nemizí - turnová fáze běží první a river dostane až to,
    co po ní z okna zbude.
    """
    if explicit > 0:
        return explicit
    if not turn_exhausted and turn_coverage < RIVER_TURN_COVERAGE_FLOOR:
        return 0
    return None if remaining_minutes >= RIVER_MIN_WINDOW_MIN else 0


def turn_subgames_by_reach(limit):
    """Vyřešené turnové podhry, od nejčastěji dosahovaných.

    River nejde plánovat plošně. Z jedné turnové podhry vyjde kolem 111 riverových
    a turnových je přes dva tisíce - to je čtvrt milionu solvů, tedy ne noc, ale
    měsíce. Reach je přitom v plánech zapsaný, takže výběr nemusí nic hádat: bere
    se shora a končí se u rozpočtu.
    """
    rows = []
    for name in os.listdir(WORK):
        directory = os.path.join(WORK, name)
        plan_path = os.path.join(directory, "plan.json")
        if not os.path.isdir(directory) or not os.path.exists(plan_path):
            continue
        try:
            plan = json.load(open(plan_path, encoding="utf8"))
        except Exception:
            continue
        for item in plan.get("items", []):
            subgame = os.path.join(directory, subgame_file_name(item))
            if not os.path.exists(subgame):
                continue
            rows.append({
                "path": subgame,
                "directory": directory,
                "board": ",".join(item.get("board", [])),
                "pot": item.get("pot", plan.get("pot", 0)),
                "stack": item.get("stack", plan.get("stack", 0)),
                "reach": item.get("reach", 0),
            })
    # Uvnitř desky podle reach, mezi deskami střídavě.
    #
    # Samotné řazení podle reach vybere prvních pět podher z jedné desky a jedné
    # linky - liší se jen turnovou kartou - protože reach je vlastnost linky, ne
    # karty. Riverová vrstva na jedné desce ale neučí nic, co by se nedalo naučit
    # z jedné z nich. Stejná chyba a stejná oprava jako u rozpočtu turnových
    # pravidel: brát po jedné z každé desky, dokud rozpočet vydrží.
    by_directory = defaultdict(list)
    for row in rows:
        by_directory[row["directory"]].append(row)
    for bucket in by_directory.values():
        bucket.sort(key=lambda row: row["reach"], reverse=True)

    queues = sorted(by_directory.values(), key=lambda bucket: bucket[0]["reach"], reverse=True)
    picked = []
    index = 0
    # `limit=None` znamená všechny; pořadí platí dál, jen konec určí deadline.
    while limit is None or len(picked) < limit:
        placed = 0
        for bucket in queues:
            if index >= len(bucket):
                continue
            if limit is not None and len(picked) >= limit:
                break
            picked.append(bucket[index])
            placed += 1
        if placed == 0:
            break
        index += 1
    return picked


def subgame_file_name(item):
    """Jak solve_plan pojmenoval soubor pro tuhle položku plánu."""
    parts = []
    for action in item.get("line", []):
        action = action.strip()
        head = action.split()[0].upper()
        if head in ("BET", "RAISE", "ALLIN", "ALL_IN"):
            parts.append(f"{head}{round(float(action.split()[1]))}")
        else:
            parts.append(head)
    return "__".join(["_".join(parts), item["turn"]]) + ".json"


def run_river_phase(deadline, workers, coverage, budget):
    """Riverová vrstva pro nejčastěji dosahované turny, dokud vydrží okno.

    Běží až po turnové fázi schválně. Nedokončený turn blokuje celou rodinu na
    review bráně, kdežto chybějící river zatím neblokuje nic - takže dokud turn
    není hotový, je river ta levnější věc, kterou lze odložit.
    """
    log(f"river phase: rozpočet {'kolik stihne' if budget is None else budget} turnových podher")
    picked = turn_subgames_by_reach(budget)
    log(f"  {len(picked)} podher vybráno podle reach")
    done = 0
    # Stejná ochrana jako u desek. Vrstva se počítá v minutách a fáze, která ji
    # začne pět minut před koncem okna, drží jádra dál do pracovního dne - přesně
    # to okno mělo řešit.
    layer_minutes = []
    # Do které rodiny vrstva padla. Bez toho log říkal jen jméno turnové
    # podhry, takže se z deseti hodin běhu nedalo zjistit, jestli šly do rodin,
    # co mají místo, nebo do těch, které už sedí na stropu modulu a ořez je
    # stejně zahodí. Přesně na tom visí rozhodnutí o rozpočtu (bod 157).
    by_family = {}
    # Podhry, ne jen vrstvy: nasycené rodiny jsou ty hluboké s největšími
    # podhrami, takže podíl vrstev podceňuje, kolik strojového času tam padlo.
    games_by_family = {}
    for row in picked:
        remaining = (deadline - datetime.now()).total_seconds() / 60
        available = free_gb()
        if available < MIN_FREE_GB:
            log(f"  stopping river phase: na disku zbývá {available:.1f} GB")
            break
        if remaining <= 0:
            log("  deadline reached; stopping river phase")
            break
        if remaining < RIVER_MIN_LAYER_START_MIN:
            log(f"  končím {remaining:.1f} min před deadline: na novou vrstvu je pozdě")
            break
        out_dir = os.path.join(row["directory"], "river", os.path.basename(row["path"])[:-5])
        plan_path = os.path.join(out_dir, "plan.json")
        os.makedirs(out_dir, exist_ok=True)
        if not os.path.exists(plan_path):
            result = subprocess.run(
                [sys.executable, os.path.join(HERE, "plan_river.py"),
                 row["path"], row["board"], str(row["pot"]), str(row["stack"]),
                 plan_path, str(coverage)],
                capture_output=True, text=True,
            )
            if result.returncode != 0 or not os.path.exists(plan_path):
                log(f"  SKIP {out_dir}: plánování selhalo")
                continue
        planned = len(json.load(open(plan_path, encoding="utf8")).get("items", []))
        solved = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
        if solved >= planned:
            continue
        board = os.path.basename(row["directory"])
        log(
            f"  solving river {board} / {os.path.basename(out_dir)}:"
            f" {planned - solved} z {planned}"
        )
        started = time.time()
        finished = run_solve_plan(plan_path, out_dir, workers, deadline)
        minutes = (time.time() - started) / 60
        after = len([f for f in os.listdir(out_dir) if f.endswith(".json") and f != "plan.json"])
        log(f"    {after}/{planned} za {minutes:.1f} min")
        layer_minutes.append(minutes)
        family = board.split("__")[0]
        by_family[family] = by_family.get(family, 0) + 1
        games_by_family[family] = games_by_family.get(family, 0) + after
        done += 1
        if not finished:
            log("  deadline reached; river phase ukončena rodičem")
            break
    # Rozptyl délek patří do logu, ne do rozhodování o startu. Příští rozbor noci
    # se tak nemusí dolovat z jednotlivých řádků, jak se to dolovalo teď.
    if layer_minutes:
        ordered = sorted(layer_minutes)
        median = ordered[len(ordered) // 2]
        log(
            f"river phase: {done} turnových podher dostalo riverovou vrstvu"
            f"; vrstva {median:.1f} min medián, {max(ordered):.1f} max"
        )
    else:
        log(f"river phase: {done} turnových podher dostalo riverovou vrstvu")
    # Rozpis, ne jen součet: noc vybírá podhry podle reach napříč rodinami, takže
    # se výsledek může celý slít do dvou nejhlubších, aniž by to ze součtu šlo poznat.
    for name, count in sorted(by_family.items(), key=lambda item: -item[1]):
        log(f"  {count:4d} vrstev, {games_by_family.get(name, 0):6d} podher do {name}")


if __name__ == "__main__":
    try:
        main()
    finally:
        # Uvolnit stroj i při pádu: držet ho vzhůru po skončení běhu by bylo
        # horší než ho nedržet vůbec.
        keep_system_awake(False)
