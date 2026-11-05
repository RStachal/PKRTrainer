# Placený vstup do aplikace a registrace – analýza a plán

Napsáno 4. 11. 2026 na rozhodnutí majitele R7 (`plan-gto-real-2026-11.md`,
oddíl 10). Fakta v oddíle 2 jsou z kódu k HEAD `49881912`. Ceny a vlastnosti
poskytovatelů jsou orientační podle stavu, který znám, a **před výběrem se
musí ověřit** u poskytovatele. Navazuje na `payment-model.md` (návrh z 10. 7.
2026, anglicky) a `forpsi-ftp-deployment.md`.

## 1. Zadání

Majitel 4. 11. 2026: „GTO i REAL neřešíme, zda placené, placený bude vstup do
aplikace, a zde také musíme vyřešit, jak se hráči z webu budou registrovat,
abychom zvládli provoz např. 1000 uživatelů.“

Z toho plyne:
- jedno předplatné na celou aplikaci místo tarifů po obsahu;
- registrace a nákup z webu;
- provoz pro řádově 1 000 uživatelů;
- aplikace zůstává offline-first.

## 2. Co je dnes

- **Distribuce:** statická PWA (Vite build) na webhostingu FORPSI přes FTP,
  staging chráněný heslem v `.htaccess` (`forpsi-ftp-deployment.md`,
  `npm run mtt:ftp-package`). Žádný backend.
- **Účty:** žádné. Statistiky a nastavení jsou jen v `localStorage` prohlížeče;
  na jiném zařízení je hráč začíná znovu.
- **Oprávnění v kódu:** hotový model (`src/core/paymentEntitlements.ts`): tarify
  `FREE`, `PRO`, `PRO_PLUS`, `TEAM_COACH`, oprávnění po obsahu, granty se stavy
  (`ACTIVE`, `TRIALING`, `GRACE`, `EXPIRED`, `REVOKED`) a offline licence
  (`pkrtrainer_offline_license_v1` s `expiresAt` a `graceUntil`).
- **Bezpečnostní díra:** `runtimeEntitlementGrants()`
  (`src/core/runtimeEntitlements.ts:26`) čte licenci z `localStorage`
  **bez ověření podpisu** (`requireSignature: false`). Kdo si do prohlížeče
  zapíše JSON licence, má placený obsah. Pro placený vstup se to musí změnit
  dřív než cokoli jiného.
- **Obsah:** packy jsou statické JS soubory s hashem v názvu, líně načítané
  (dnes 85,7 MB surově, 12,3 MB gzip celkem). Kdo zná adresu, stáhne je i bez
  přihlášení.

## 3. Doporučená architektura

```text
web (landing, ceník, registrace)
   │  účet: e-mail + heslo nebo odkaz e-mailem
   ▼
správa účtů a databáze (EU region)  ◄── webhook ── platební brána (MoR)
   │  vydá podepsanou licenci (JWT, ES256)
   ▼
aplikace (PWA) – ověří podpis veřejným klíčem, uloží licenci, funguje offline
   │  chráněné packy jen s platnou relací
   ▼
CDN s hraniční funkcí (kontrola relace u /assets/mtt-*)
```

| Část | Doporučení | Proč | Alternativa |
|---|---|---|---|
| Hosting aplikace a webu | CDN se statickými stránkami a hraničními funkcemi (např. Cloudflare Pages + Workers) | HTTPS, rychlost po celé Evropě, 1 000 uživatelů je hluboko v bezplatném nebo nejlevnějším tarifu | FORPSI zůstane na staging; za CDN by šlo i FORPSI |
| Účty | spravovaná služba s databází v EU (např. Supabase Auth + Postgres) | registrace, ověření e-mailu, reset hesla a ochrana proti zneužití hotové; nic z toho nepsat sám | Firebase Auth; vlastní backend na FORPSI (PHP) nedoporučuji – bezpečnost a údržba by byly naše |
| Platby | Merchant of Record (např. Paddle) | prodává jménem DrillEV a řeší DPH v celé EU (OSS), faktury, refundace a spotřebitelská práva | Stripe: nižší poplatky, ale DPH, faktury a OSS hlášení řeší majitel |
| Licence | podepsaný JWT (ES256), platnost 7 dní, offline grace 14 dní, limit 3 zařízení se samoobslužným resetem | ověření v aplikaci přes WebCrypto (P-256 umí i Android WebView), bez sítě funguje dál | – |
| Ochrana obsahu | packy na cestách `/assets/mtt-*` za hraniční funkcí, která ověří relaci (cookie `HttpOnly`) | dynamický `import()` neumí přidat hlavičku, cookie na stejné doméně ano | jen zámek v aplikaci (packy veřejné) – slabší, viz P6 |
| Statistiky | zůstávají lokálně; synchronizace do účtu později | pro spuštění nejsou nutné | – |

### Provoz pro 1 000 uživatelů (odhad)

- Při 30 % denně aktivních je to kolem 300 přihlášení a obnov licence denně,
  zanedbatelná zátěž pro spravované služby.
- Přenos: první načtení obsahu 5–15 MB gzip na uživatele, pak z mezipaměti
  Service Workeru. Za měsíc řádově 20 GB, pro CDN bez problému.
- Úzké hrdlo nebude výkon, ale **podpora**: zapomenutá hesla, výměna zařízení,
  refundace. Proto samoobslužný účet (zařízení, předplatné) a vyřizování plateb
  přes MoR.

### Náklady (orientačně, ověřit)

| Položka | Měsíčně pro 1 000 uživatelů |
|---|---|
| CDN a hraniční funkce | 0–5 USD |
| Účty a databáze | 0–25 USD |
| Odesílání e-mailů (ověření, reset) | 0–15 USD |
| Platby přes MoR | kolem 5 % + 0,5 USD z transakce (u Stripe méně, ale DPH a účetnictví navíc) |

## 4. Tok hráče

1. Web: „Vyzkoušet“ nebo „Koupit“.
2. Registrace e-mailem (heslo nebo odkaz e-mailem), ověření e-mailu.
3. Platba v okně platební brány; zkušební doba podle P2.
4. Webhook brány aktivuje předplatné, účet dostane licenci.
5. Aplikace (web nebo instalovaná PWA) licenci ověří a uloží; trénink jde
   i offline do konce grace.
6. Účet v aplikaci: zařízení (odhlásit, uvolnit), předplatné (zrušení přes
   portál brány), export statistik.
7. Po vypršení: aplikace zůstane otevřená, statistiky čitelné, trénink
   zamčený s odkazem na obnovení.

## 5. Kroky a odhad

Dny jsou pracovní dny agenta, odhad.

| Krok | Obsah | Agent | Majitel |
|---|---|---|---|
| P-A Rozhodnutí a účty | P1–P8 (oddíl 6); účty u poskytovatelů, ověření firmy u platební brány (může trvat 1–2 týdny), doména | 0,5 dne | 2–3 h + čekání |
| P-B Backend | projekt v EU, schéma (účty, předplatná, licence, zařízení), pravidla přístupu, funkce pro webhook a vydání a obnovu licence | 3–4 dny | – |
| P-C Platby | produkty a ceny, checkout, ověření webhooku, zákaznický portál, testovací režim | 2–3 dny | – |
| P-D Aplikace | přihlášení a registrace v GUI kitu, ověření podpisu licence (WebCrypto), zámek a offline grace, účet a zařízení; **náhrada nepodepsané licence** | 3–4 dny | – |
| P-E Web | landing, ceník, registrace, právní stránky (texty dodá nebo schválí majitel) | 2 dny | texty |
| P-F Ochrana obsahu | hraniční funkce před packy, relace v cookie, Service Worker offline | 2–3 dny | – |
| P-G Ověření | E2E s testovacími platbami, bezpečnostní kontrola (podvržená licence, únik tokenu), zátěžový test na 1 000 simulovaných uživatelů | 2 dny | přejímka 1 h |

Celkem **14–18 dní agenta**. Majitel: rozhodnutí, smlouvy a ověření
u poskytovatelů, právní texty.

**Doporučené zařazení:** MTT 1.0 vydat v prosinci jako betu s pozvánkami
přes dnešní staging chráněný heslem, placený vstup spustit v lednu. Majitel
ale účty u poskytovatelů a právní texty založí **hned**, protože ověření firmy
u platební brány a texty mají dlouhou dobu náběhu a na agentovi nezávisí.

## 6. Rozhodnutí majitele

| | rozhodnutí | doporučení |
|---|---|---|
| P1 | Pořadí: MTT 1.0 jako beta s pozvánkami v prosinci, placený vstup v lednu | ano |
| P2 | Cenový model: měsíční a roční předplatné, cena, zkušební doba (třeba 7 dní) nebo ukázka zdarma bez účtu | předplatné měsíc/rok + 7 dní zkušebně |
| P3 | Platby: Merchant of Record (Paddle a podobné), nebo Stripe | MoR – DPH v EU a faktury neřešit sám |
| P4 | Hosting: CDN s hraničními funkcemi, FORPSI jen staging | ano |
| P5 | Přihlášení: e-mail + heslo a odkaz e-mailem; Google volitelně | e-mail a odkaz; Google později |
| P6 | Ochrana obsahu při spuštění: packy za kontrolou relace, nebo jen zámek v aplikaci | packy za kontrolou relace – hodnota produktu je v obsahu |
| P7 | Limit zařízení a offline grace | 3 zařízení, 14 dní |
| P8 | Právní a daňový rámec: obchodní podmínky, ochrana osobních údajů (GDPR), kdo je prodávající, 18+ | konzultace s účetním a právníkem; MoR část zjednoduší |

**Rozhodnuto 5. 11. 2026.** Majitel: „Souhlasím, pokračuj“ – P1–P8 platí podle
doporučení. MTT 1.0 jde v prosinci jako beta s pozvánkami přes dnešní
staging, placený vstup v lednu. **Na majiteli teď** (doba náběhu nezávisí na
agentovi): účet u platební brány (Merchant of Record) s ověřením firmy, účet
pro správu uživatelů v EU, doména, konzultace s účetním a právníkem
a podklady k obchodním podmínkám a ochraně osobních údajů (P8). Technické
kroky P-B až P-G začnou po MTT 1.0.

## 7. Rizika

- **Nepodepsaná licence** (oddíl 2) – do placeného spuštění opravit, jinak je
  placený vstup jen formální.
- **Doba náběhu u poskytovatelů** – ověření firmy a právní texty mohou trvat
  déle než technika; začít hned.
- **Únik obsahu** – bez ochrany packů na hraně si je technicky zdatný uživatel
  stáhne a sdílí. Plná ochrana kódu v prohlížeči neexistuje; cíl je zdražit
  zneužití, ne ho znemožnit.
- **Ztráta statistik** při změně zařízení – dokud není synchronizace, říct to
  hráči a nabídnout export a import (ten už aplikace má).
- **Závislost na poskytovatelích** – oprávnění zůstávají v našem modelu
  (`paymentEntitlements.ts`) a brána je za adaptérem, takže výměna poskytovatele
  nemění trénink ani obsah.
