# TexasSolver MTT safe flops v1

Účel: první bezpečný balíček flopů pro ověření TexasSolver workflow a následný export strategií pro PKRTrainer.

Balíček řeší jednu family:

- `MTT9_50BB_BTN_BB_SRP`
- IP: BTN
- OOP: BB
- model: testovací chipEV postflop sanity-check
- pot: `50`
- effective stack: `200`
- sizing: jednoduchý `50%` bet, `60%` raise, all-in povolený
- solver: `200` iterací, `0.5%` exploitability target, `8` threadů

Toto není finální produkční solve. Je to malý smoke/validation set, aby šlo ověřit:

1. že TexasSolver načte parameter files,
2. že postaví strom,
3. že doběhne solve,
4. že exportuje JSON,
5. že výstup půjde převést do PKRTrainer solver-verification pipeline.

## Flop set

| ID | Board | Typ |
| --- | --- | --- |
| `A72r` | `As,7d,2c` | dry A-high rainbow |
| `K83r` | `Ks,8h,3d` | dry K-high rainbow |
| `QJ2tt` | `Qs,Jh,2h` | broadway two-tone |
| `JT9tt` | `Jd,Ts,9d` | connected broadway two-tone |
| `883r` | `8s,8d,3c` | paired dry |
| `765tt` | `7h,6h,5s` | low connected two-tone |
| `AT4mono` | `Ah,Th,4h` | A-high monotone |
| `Q76mono` | `Qc,7c,6c` | medium monotone |

## GUI import

1. V TexasSolver klikni `Open Parameters Folder`.
2. Do otevřené složky zkopíruj celý adresář:

```text
pkrtrainer_mtt_safe_flops_v1
```

3. Zavři a znovu otevři TexasSolver, nebo v pravém panelu rozbal nově zkopírovanou složku.
4. Vyber jeden `.txt` parameter file, například:

```text
01_MTT9_50BB_BTN_BB_SRP_A72r.txt
```

5. Klikni/loadni parametr, potom:
   - `Build Tree`
   - `Start solving`
   - po doběhu exportuj/show result podle GUI.

Pokud parameter file po načtení rovnou obsahuje `start_solve`/`dump_result`, GUI může solve spustit automatizovaně podle aktuální verze. Pokud ne, použij soubor jako nastavení a klikni ručně.

## Console run

Nejrychlejší test jednoho spotu:

```powershell
cd C:\Users\stachal\Downloads\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows
.\console_solver.exe -i C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_safe_flops_v1\01_MTT9_50BB_BTN_BB_SRP_A72r.txt
```

Výstup JSON se vytvoří v aktuální pracovní složce TexasSolveru podle `dump_result` řádku.

Poznámka: full range spot s těmito parametry může běžet několik minut na jeden flop. První test proto pouštěj jen na 1 flop; až potom zvedni počet.

Připravený runner s limitem:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 1
```

Po ověření:

```powershell
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 2
.\Agents\solver-input\texas-solver\mtt-safe-flops-v1\run-console-selected.ps1 -Limit 8
```

## Po doběhu

Pro PKRTrainer solver-verification čekáme pro family:

```text
Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver/MTT9_50BB_BTN_BB_SRP/
  strategy-export.json
  accuracy-report.json
  review-notes.md
```

První raw solver exporty zatím nepřepisuj ručně do production `normalized.json`; nejdřív je zvalidujeme.
