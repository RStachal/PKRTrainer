import {
  auditAllSixMaxDerivedPacks,
  renderSixMaxOpenWidthReport,
} from "../src/data/ranges/sixMaxOpenWidthAudit";

/**
 * Porovná odvozený šestistolový pack s veřejně uváděnými šířkami otevírání.
 *
 *   npm run mtt:six-max-widths
 *
 * Nekončí chybou. Odchylka od publikovaného souhrnu je zjištění, ne rozbitý
 * build - zdroje se mezi sebou liší o body a strom, který řešily, neznáme.
 * Chybou by bylo tvrdit, že odvozený pack je ověřený, aniž by ho někdo s něčím
 * porovnal.
 */
const audits = auditAllSixMaxDerivedPacks();
console.log(renderSixMaxOpenWidthReport(audits));
const worst = audits.flatMap((audit) => audit.outOfBand);
console.log(worst.length === 0
  ? "Všechny sedačky jsou uvnitř publikovaného pásma."
  : `${worst.length} sedaček mimo pásmo, nejvíc ${worst[0].position} ${worst[0].stackBB}BB o ${worst[0].deviationPct} b.`);
