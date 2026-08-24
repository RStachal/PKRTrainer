# PKRTrainer Codex instructions

## Project goal

Refactor the original single-file poker trainer into a maintainable offline-capable Vanilla TypeScript + Vite app while preserving current behavior.

## Baseline

The original working app is stored under `legacy/`.

Do not modify files under `legacy/` unless explicitly requested.

## Postup práce: jak se pracuje dopředu, ne dokola

Zapsáno 24. 8. 2026 po tom, co jedna relace ohlásila hotovo čtyřikrát a pokaždé
se ukázalo něco dalšího. Příčina nebyla nešikovnost, ale **tři chybějící
pravidla**. Nejsou to předsevzetí, jsou to podmínky.

### 1. Do dokumentu jde jen změřené

Tvrzení v plánu nebo v deníku musí nést **číslo a příkaz, který ho vyrobil**.
Když ho nemá, nezapisuje se.

Protipříklad, na kterém to vzniklo: do plánu se napsalo „pravidla jsou seřazená
podle dosahu, takže část 1 pokryje to nejčastější". Znělo to samozřejmě, nikdo
to neměřil a **bylo to špatně** - dosah je rozložený rovnoměrně, první polovina
nese přesně 50 %. Doporučení postavené na tom by znamenalo postavit mechaniku,
která nic nepřinese.

### 2. Jedna definice hotového, jeden příkaz: `npm run verify:block`

Blok je hotový, když projde **celý ověřovací řetěz**, ne když projdou testy.
Dokud neprojde, blok se nehlásí jako hotový - ani „hotovo, ale ještě ověřím".

Ten řetěz je `verify:block`: typecheck, testy, `verify:ranges`, build,
`verify:precache`, rozpočty a **Chrome E2E**. E2E tam patří proto, že dřív
běželo až uvnitř balíčkování, takže se mobilní přetečení o 39 px na 360 px
displeji našlo teprve při čtvrtém pokusu o ZIP. To nebyla smůla, to byla
chybějící brána.

**`release:check` to není a nesmí se s tím zaměnit.** Měřeno 24. 8. 2026:
padá na třech branách, které s kódem nesouvisí - „MTT completion production
gate" (6 zablokovaných řádků, knihovna je 4/64), „MTT postflop final release
gate" a „Android WebView preflight" (není připojené zařízení). První dvě měří
úplnost knihovny, která čeká na data od majitele, takže `release:check`
**v tomhle stavu projít nemůže** a jako denní brána je nepoužitelný.

Mimochodem: tohle pravidlo tu nejdřív stálo s `release:check` a bylo tím
porušením pravidla 1 - napsal jsem jako fakt něco, co jsem neověřil. Opraveno
až poté, co to spadlo.

### 3. Jedno hlášení na blok, ne na nález

Zkoumat se má potichu a ohlásit **výsledek**. Nález uprostřed bloku je normální
práce, ne novinka; když se každý odbočka popíše zvlášť, čte se to jako
přeskakování, i když je postup správný.

### Co tím nezmizí

Zpětné kroky se nedají vypnout úplně. Když oprava odhalí hlubší vadu - třeba že
**18 z 18 spotů ukazuje rozbité vysvětlení** - je zastavení správné rozhodnutí,
ne selhání. Měřítkem profesionality tady není „nikdy neměnit směr", ale **nikdy
nedodat rozbitou věc a nikdy netvrdit víc, než co je změřené**.

## Hard rules

- Preserve existing behavior unless explicitly requested.
- Do not rewrite the whole app in one step.
- Do not change poker ranges casually.
- Do not change `correctKeys`, `strictCorrect`, question IDs, seed behavior, pool behavior or localStorage keys without explicit migration.
- Preserve Czech UI text.
- Keep the app offline-capable.
- Keep Android WebView compatibility in mind.
- Prefer small, reviewable diffs.
- Do not commit automatically.
- After changes, run build/tests if available.

## Refactor direction

Use Vanilla TypeScript + Vite.

Extract gradually:
- constants and RNG
- hand utilities
- storage keys and state loading
- ranges
- question generators
- scoring
- UI renderers
- HH parser
- dashboard/statistics