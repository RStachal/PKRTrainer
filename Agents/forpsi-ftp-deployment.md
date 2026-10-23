# FORPSI FTP Deployment

Updated: 2026-07-22

This guide is for a password-protected staging deployment of the static Vite build to FORPSI Linux webhosting.

FORPSI documents that Linux hosting supports FTP/FTP SSL, `.htaccess`, and Apache `AuthConfig`; their password-protection article uses `.htaccess` plus `.htpasswd` and recommends storing `.htpasswd` in the FTP root `/data/` directory, outside browser-accessible content.

Sources:

- https://www.forpsi.com/webhosting/linux/?lang=en-us
- https://support.forpsi.com/kb/a2393/zabezpeceni-pristupu-do-adresare.aspx
- https://support.forpsi.com/kb/a4546/redirection-to-https.aspx
- https://support.forpsi.com/kb/a4259/creating-subdomains.aspx

## Local Build

Preferred release path:

```powershell
npm run mtt:playable-beta -- --summary
npm run mtt:ftp-package -- --write --confirm=PACKAGE_MTT_PLAYABLE_BETA --summary
```

The confirmed package command requires a clean commit and reruns typecheck, the
full test suite, registry/Core/beta/range gates, production build, precache,
bundle budget and self-hosted Chrome preview E2E. It writes a ZIP plus JSON manifest under
`deploy/`, then verifies every archived file by size and SHA-256. Local hidden
source maps remain available for diagnostics but are excluded from FTP. Add
`--require-target-complete` only for the final eight-profile playable-beta
milestone; current incremental packages retain explicit known limitations.

Manual troubleshooting path:

Run the normal production checks first:

```powershell
npm run typecheck
npm test
npm run build
npm run bundle:budget
```

The manual upload source is `dist/`. The automated ZIP contains the same files
plus `.htaccess.example`; it never includes raw solver or range-intake files.

Expected files:

- `dist/index.html`
- `dist/sw.js`
- `dist/manifest.webmanifest`
- `dist/assets/main-*.js`

## FORPSI Target Folder

Use one of these targets:

- Main domain: upload the contents of `dist/` into FTP folder `/www/`.
- Subdomain: create the subdomain in FORPSI administration, then upload the contents of `dist/` into `/subdoms/<subdomain>/`.

Upload the contents of `dist/`, not the `dist` directory itself.

## Password Protection

Use HTTP Basic Auth on Linux hosting.

1. Create `.htpasswd` outside the web root, ideally in `/data/.htpasswd-pkrtrainer`.
2. Generate the password hash with Apache `htpasswd`:

```bash
htpasswd -cb .htpasswd-pkrtrainer pkrtrainer YOUR_PASSWORD
```

3. Upload `.htpasswd-pkrtrainer` to `/data/` on FTP.
4. Copy `deploy/forpsi/.htaccess.example` to the deployed web root as `.htaccess`.
5. Replace `AuthUserFile` with the absolute FORPSI path to the uploaded file. FORPSI's example shape is:

```apache
AuthUserFile /web/htdocsX/ftplogin/home/data/.htpasswd-pkrtrainer
```

6. Open the staging URL in an incognito/private browser window and confirm that the browser asks for username/password before showing the app.

Do not commit `.htpasswd`, real passwords, or generated password hashes.

## HTTPS

FORPSI supports HTTPS redirect from administration and also documents `.htaccess` redirect rules. Prefer the FORPSI administration setting when available. The provided `.htaccess.example` also contains an HTTPS redirect fallback.

## Service Worker Note

The app is built with relative Vite paths and registers `./sw.js`. Deploy `sw.js` in the same folder as `index.html`; otherwise the offline cache will not initialize.

After changing the deployed folder or moving between staging and production, test in an incognito/private window or unregister the previous service worker in browser dev tools.

## Quick FTP Checklist

1. Build locally.
2. Confirm `dist/index.html`, `dist/sw.js`, `dist/manifest.webmanifest` and `dist/assets/` exist.
3. Create or update `/data/.htpasswd-pkrtrainer` on FORPSI.
4. Upload all `dist/` contents to `/www/` or `/subdoms/<subdomain>/`.
5. Upload `.htaccess` from the template to the same folder.
6. Test HTTP Basic Auth.
7. Test app load, training start, postflop tab, statistics and service worker registration.
8. Keep staging password-protected until MTT release gates are green.
