PKR TRAINER - SPUŠTĚNÍ A DEPLOY
================================

Lokální vyzkoušení ve Windows:
1. Rozbalte celý ZIP.
2. Dvakrát klikněte na START_LOCAL.bat.
3. Aplikace se otevře na http://127.0.0.1:8080/.
4. Server ukončíte zavřením okna nebo klávesami Ctrl+C.

Soubor index.html neotvírejte přímo dvojklikem. Moderní prohlížeče blokují
JavaScript moduly načítané přes file://.

Webový deploy:
- Nahrajte index.html, manifest.webmanifest, sw.js a složku assets do kořene webu.
- Použijte HTTPS, aby mohl fungovat service worker a offline režim.
- Soubory START_LOCAL.bat, serve-local.ps1 a README-SPUSTENI.txt na server
  nahrávat nemusíte.
