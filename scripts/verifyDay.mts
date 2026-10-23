/**
 * `npm run verify:day` - brána pro vývoj přes den.
 *
 * ## Proč (od 22. 10. 2026)
 *
 * Vlastník chce vývoj i přes den, jenže stroj je jeho pracovní a v jeho práci
 * jsou špičky, kdy paměti krátkodobě ubude. `verify:block` se do dne nevejde:
 * produkční build chce ve špičce kolem 11 GB. Celou bránu proto dělá ranní
 * cyklus hned po sobě, dokud je stroj volný (`after-night.ps1`, výsledek
 * v `artifacts/verify-morning.json`), a přes den běží tohle:
 *
 * - všechny kroky `verify:block` až po hranici EV - typová kontrola, sada,
 *   range, drift preflopu, doručení po odpovědi i vybrané situace, meze EV;
 * - bez produkčního buildu, kontroly precache, rozpočtu svazku a Chrome E2E;
 * - sada na **jednom** workeru (`PKRTRAINER_TEST_WORKERS=1`): pomalejší, ale
 *   s polovinou paměti;
 * - před každým krokem počká, až je volno dost paměti, nejvýš 20 minut - krátká
 *   špička se přečká, místo aby krok spadl nebo vlastníkovi zahltil stroj.
 *   Po 20 minutách krok poběží stejně a řekne to.
 *
 * Zelená denní brána neříká nic o buildu ani o prohlížeči; to říká až ranní.
 */
import { spawnSync } from "node:child_process";
import { freemem } from "node:os";

interface Step {
  script: string;
  /** Kolik volné paměti chtít před startem, v GB. */
  needGb: number;
  env?: Record<string, string>;
}

const STEPS: readonly Step[] = [
  { script: "typecheck", needGb: 1.5 },
  { script: "test", needGb: 4, env: { PKRTRAINER_TEST_WORKERS: "1" } },
  { script: "verify:ranges", needGb: 2 },
  { script: "mtt:preflop-drift", needGb: 2 },
  { script: "mtt:post-answer", needGb: 3 },
  { script: "mtt:picked-situation", needGb: 3 },
  { script: "mtt:ev-bounds", needGb: 2 },
];

const MAX_WAIT_MINUTES = 20;
const POLL_SECONDS = 30;

const freeGb = (): number => freemem() / 1024 ** 3;

function sleep(seconds: number): void {
  // Synchronní čekání bez zátěže procesoru; skript je řetěz kroků, nic jiného nedělá.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function waitForMemory(step: Step): void {
  const started = Date.now();
  let announced = false;
  while (freeGb() < step.needGb) {
    const waited = (Date.now() - started) / 60000;
    if (waited >= MAX_WAIT_MINUTES) {
      console.log(`verify:day: ${step.script} - po ${MAX_WAIT_MINUTES} min pořád jen ${freeGb().toFixed(1)} GB,`
        + ` jedu stejně (krok chce ${step.needGb} GB)`);
      return;
    }
    if (!announced) {
      console.log(`verify:day: ${step.script} čeká na paměť - volno ${freeGb().toFixed(1)} GB,`
        + ` krok chce ${step.needGb} GB; nejvýš ${MAX_WAIT_MINUTES} min`);
      announced = true;
    }
    sleep(POLL_SECONDS);
  }
  if (announced) {
    console.log(`verify:day: ${step.script} - paměť se uvolnila po ${((Date.now() - started) / 60000).toFixed(1)} min`);
  }
}

const started = Date.now();
for (const step of STEPS) {
  waitForMemory(step);
  const stepStarted = Date.now();
  const result = spawnSync(`npm run ${step.script}`, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...(step.env ?? {}) },
  });
  const minutes = ((Date.now() - stepStarted) / 60000).toFixed(1);
  if (result.status !== 0) {
    console.log(`verify:day: ČERVENÁ - ${step.script} skončil kódem ${result.status ?? "?"} po ${minutes} min`);
    process.exit(result.status ?? 1);
  }
  console.log(`verify:day: ${step.script} ok za ${minutes} min`);
}
console.log(`verify:day: zelená za ${((Date.now() - started) / 60000).toFixed(1)} min`
  + " - build, precache, rozpočet svazku a Chrome E2E dělá ranní brána (artifacts/verify-morning.json)");
