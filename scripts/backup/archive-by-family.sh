#!/usr/bin/env bash
#
# Zabalí velký adresář po rodinách, aby šel do cloudu - a sám se zastaví před
# nočním oknem solveru.
#
#   scripts/backup/archive-by-family.sh <zdroj> <cíl>
#   scripts/backup/archive-by-family.sh artifacts/decomposition /c/.../backup-rozklad
#   PKRTRAINER_BACKUP_IGNORE_NIGHT=1 scripts/backup/archive-by-family.sh ...   # jen vědomě
#
# ## Proč po rodinách
#
# `artifacts/decomposition` mělo 1 555 787 souborů a cloudová synchronizace na
# takovém počtu malých souborů utrácí dny režií. Po rodinách z toho vyšlo
# **33 archivů a 37,4 GB** z 108,8 GB, tedy komprese 2,9:1 - normální úloha.
#
# ## Proč tu je hlídání nočního okna
#
# **Změřeno 14. 10. 2026 a je to zaplacená lekce.** První běh jsem pustil
# 13. 10. v 18:12 bez jakékoli zábrany a balil se do **05:29**, tedy skrz celé
# noční okno solveru (21:00-07:00). Co to stálo, se dá změřit, protože noc
# skončila dřív než archivace:
#
#   desky solvované při běžící archivaci   18 desek, průměr 28,50 min
#   desky po 05:29                          3 desky, průměr 17,10 min
#   dřívější noci bez archivace            60 desek, průměr 25,18 min
#
# Robustní srovnání je 28,50 proti 25,18, tedy **+13 %** - a to stačilo na to,
# aby noc nedokončila čtvrtou rodinu, kterou hlídač slíbil. Medián se přitom
# nezhoršil vůbec (23,6 proti 24,15), takže archivace neprodražila typickou
# desku, ale **nafoukla chvost**: maximum vyskočilo z 52,7 na 62,2 min.
#
# Pravidlo projektu je, že solver vlastní 21:00-07:00 na plný výkon. Tenhle
# skript ho proto drží sám, místo aby se na to spoléhalo.
set -u

SRC="${1:-}"
DST="${2:-}"
if [ -z "$SRC" ] || [ -z "$DST" ]; then
  echo "použití: $0 <zdrojový adresář> <cílový adresář>" >&2
  exit 64
fi
[ -d "$SRC" ] || { echo "zdroj neexistuje: $SRC" >&2; exit 66; }

# Okno solveru. Konec balení je dřív než jeho start, aby doběhl i rozdělaný tar.
NIGHT_START_MIN=$((20 * 60 + 45))
NIGHT_END_MIN=$((7 * 60))

in_night_window() {
  local now
  now=$((10#$(date +%H) * 60 + 10#$(date +%M)))
  # Okno přechází přes půlnoc, takže je to „nebo", ne „a".
  [ "$now" -ge "$NIGHT_START_MIN" ] || [ "$now" -lt "$NIGHT_END_MIN" ]
}

if [ "${PKRTRAINER_BACKUP_IGNORE_NIGHT:-0}" != "1" ] && in_night_window; then
  echo "je $(date +%H:%M) - noční okno solveru (20:45-07:00), nezačínám."
  echo "Vědomě přes to: PKRTRAINER_BACKUP_IGNORE_NIGHT=1 $0 $SRC $DST"
  exit 0
fi

mkdir -p "$DST" || exit 1
cd "$SRC" || exit 1

families=$(ls -d */ 2>/dev/null | sed 's|/$||' | sed 's/__.*//' | sort -u)
total=$(printf '%s\n' "$families" | grep -c .)
i=0
stopped=0

for fam in $families; do
  i=$((i + 1))

  # Kontrola před **každou** rodinou, ne jen na začátku: první běh trval
  # 11 h 17 min, takže jedna kontrola na startu nic neznamená.
  if [ "${PKRTRAINER_BACKUP_IGNORE_NIGHT:-0}" != "1" ] && in_night_window; then
    echo "[$i/$total] je $(date +%H:%M), začíná noční okno - zastavuji."
    echo "Hotové archivy zůstávají; další běh na nich pokračuje."
    stopped=1
    break
  fi

  out="$DST/$fam.tar.gz"
  if [ -s "$out" ]; then
    echo "[$i/$total] $fam - hotovo už dřív, přeskakuji"
    continue
  fi

  boards=$(ls -d "${fam}"__* 2>/dev/null | tr '\n' ' ')
  if [ -z "$boards" ]; then
    echo "[$i/$total] $fam - žádné desky, přeskakuji"
    continue
  fi

  n=$(printf '%s' "$boards" | wc -w)
  start=$(date +%s)
  # Do dočasného jména a až po úspěchu přejmenovat: přerušený běh tak nenechá
  # neúplný archiv, který by příští běh přeskočil jako hotový.
  if tar -czf "$out.part" $boards 2>/dev/null; then
    mv "$out.part" "$out"
    mb=$(( $(stat -c%s "$out") / 1048576 ))
    echo "[$i/$total] $fam - $n desek, ${mb} MB, $(( $(date +%s) - start )) s"
  else
    rm -f "$out.part"
    echo "[$i/$total] $fam - SELHALO"
  fi
done

echo "=== $( [ "$stopped" = 1 ] && echo "zastaveno před nocí" || echo "hotovo" ) ==="
ls -1 "$DST"/*.tar.gz 2>/dev/null | wc -l | sed 's/^/archivů: /'
du -sm "$DST" 2>/dev/null | awk '{printf "celkem: %.1f GB\n", $1/1024}'

# Kontrolní součty se počítají, až je sada úplná - jinak by SHA256SUMS.txt
# tvrdil, že záloha je hotová, a byla by to polovina.
if [ "$stopped" = 0 ]; then
  ( cd "$DST" && sha256sum ./*.tar.gz > SHA256SUMS.txt 2>/dev/null ) \
    && echo "kontrolní součty: $DST/SHA256SUMS.txt"
else
  echo "kontrolní součty se nepočítaly - sada není úplná."
fi
