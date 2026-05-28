import type { ActionId, SpotCategory, TrainingSpot } from "../../domain/spot";
import { getRangeProfile } from "../ranges/rangeProfileRegistry";

type SpotInput = {
  id: string;
  category: SpotCategory;
  title: string;
  prompt: string;
  heroHand: readonly string[];
  effectiveStack: string;
  potLabel: string;
  seats: TrainingSpot["seats"];
  answerOptions: readonly ActionId[];
  correctAction: ActionId;
  rangeProfileId: string;
  explanation: string;
};

function parseBbStack(effectiveStack: string): number | null {
  const match = effectiveStack.match(/(\d+(?:\.\d+)?)\s*BB/i);
  if (!match) return null;
  return Number(match[1]);
}

function pickStackBandProfileId(baseProfileId: string, effectiveStack: string): string {
  const stack = parseBbStack(effectiveStack);
  const isShallow = stack === null ? false : stack <= 20;

  if (baseProfileId === "mtt-15-25-open-btn") {
    return isShallow ? "mtt-15-20-open-btn" : "mtt-21-25-open-btn";
  }

  if (baseProfileId === "mtt-15-25-open-co-hj") {
    return isShallow ? "mtt-15-20-open-co-hj" : "mtt-21-25-open-co-hj";
  }

  if (baseProfileId === "mtt-15-25-open-sb") {
    return isShallow ? "mtt-15-20-open-sb" : "mtt-21-25-open-sb";
  }

  if (baseProfileId.startsWith("mtt-15-20-rejam-")) {
    return isShallow
      ? baseProfileId
      : baseProfileId.replace("mtt-15-20-rejam-", "mtt-21-25-rejam-");
  }

  if (baseProfileId.startsWith("mtt-15-25-bb-defend-")) {
    return isShallow
      ? baseProfileId.replace("mtt-15-25-bb-defend-", "mtt-15-20-bb-defend-")
      : baseProfileId.replace("mtt-15-25-bb-defend-", "mtt-21-25-bb-defend-");
  }

  if (baseProfileId.startsWith("mtt-15-25-iso-")) {
    return isShallow
      ? baseProfileId.replace("mtt-15-25-iso-", "mtt-15-20-iso-")
      : baseProfileId.replace("mtt-15-25-iso-", "mtt-21-25-iso-");
  }

  return baseProfileId;
}

function makeSpot(input: SpotInput): TrainingSpot {
  const rangeProfileId = pickStackBandProfileId(
    input.rangeProfileId,
    input.effectiveStack,
  );
  const rangeProfile = getRangeProfile(rangeProfileId);

  return {
    id: input.id,
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: input.category,
    title: input.title,
    prompt: input.prompt,
    heroHand: input.heroHand,
    effectiveStack: input.effectiveStack,
    potLabel: input.potLabel,
    seats: input.seats,
    answerOptions: input.answerOptions,
    correctAction: input.correctAction,
    rangeProfileId,
    range: {
      title: rangeProfile.title,
      summary: rangeProfile.summary,
      cells: rangeProfile.cells,
    },
    explanation: input.explanation,
  };
}

const BLINDS_SEATS = [
  { position: "BTN", label: "Hero", isHero: true },
  { position: "SB", label: "SB" },
  { position: "BB", label: "BB" },
] as const;

const SB_OPEN_SEATS = [
  { position: "SB", label: "Hero", isHero: true },
  { position: "BB", label: "BB" },
] as const;

export const MTT_15_25BB_SPOTS = [
  makeSpot({
    id: "mtt-15-25-open-btn-a8o",
    category: "OPEN",
    title: "BTN open proti blindum",
    prompt:
      "MTT, efektivne 20 BB. Jsi na BTN s A8o, hraci na blindech folduji standardne. Jaka je vychozi akce?",
    heroHand: ["As", "8d"],
    effectiveStack: "20 BB",
    potLabel: "Blindy 0.5 / 1 BB",
    seats: BLINDS_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-btn",
    explanation:
      "A8o je pro BTN pri 20 BB standardni open. Jam nechavame hlavne pro specificke exploit spoty.",
  }),
  makeSpot({
    id: "mtt-15-25-open-btn-k5s",
    category: "OPEN",
    title: "BTN suited king open",
    prompt:
      "MTT, efektivne 18 BB. Jsi na BTN s K5s, oba blindy hraji bez vyrazne agrese. Jaka je vychozi akce?",
    heroHand: ["Ks", "5s"],
    effectiveStack: "18 BB",
    potLabel: "BTN unopened",
    seats: BLINDS_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-btn",
    explanation:
      "K5s je na BTN pri 18 BB dost silna handa na mensi open. Open zachova prostor na fold proti nevhodne akci.",
  }),
  makeSpot({
    id: "mtt-15-25-open-btn-q4o",
    category: "OPEN",
    title: "BTN bottom open hranice",
    prompt:
      "MTT, efektivne 21 BB. Jsi na BTN s Q4o proti beznym blindum. Jaka je vychozi akce?",
    heroHand: ["Qh", "4c"],
    effectiveStack: "21 BB",
    potLabel: "BTN unopened",
    seats: BLINDS_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-open-btn",
    explanation:
      "Q4o je prilis slaba offsuit kombinace. Bez exploitu na blindy je fold lepsi nez automaticky krast.",
  }),
  makeSpot({
    id: "mtt-15-25-open-co-k9s",
    category: "OPEN",
    title: "CO open K9s",
    prompt:
      "MTT, efektivne 24 BB. Jsi na CO s K9s a akce je fold k tobe. Jaka je vychozi akce?",
    heroHand: ["Kh", "9h"],
    effectiveStack: "24 BB",
    potLabel: "CO unopened",
    seats: [
      { position: "CO", label: "Hero", isHero: true },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-co-hj",
    explanation:
      "K9s ma solidni equity, blocker a hratelnost po flopu. Pri 24 BB nejde o jam, ale o standardni open.",
  }),
  makeSpot({
    id: "mtt-15-25-open-co-q8o",
    category: "OPEN",
    title: "CO fold Q8o",
    prompt:
      "MTT, efektivne 20 BB. Jsi na CO s Q8o, za tebou sedi tri hraci. Jaka je vychozi akce?",
    heroHand: ["Qs", "8d"],
    effectiveStack: "20 BB",
    potLabel: "CO unopened",
    seats: [
      { position: "CO", label: "Hero", isHero: true },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-open-co-hj",
    explanation:
      "Q8o je z CO mimo default open range. BTN a blindy maji dost prostoru nas potrestat.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-q9o",
    category: "SB_OPEN",
    title: "SB open Q9o",
    prompt:
      "MTT, efektivne 22 BB. Vse foldne k tobe na SB, drzis Q9o. BB defenduje standardne. Jaka je vychozi akce?",
    heroHand: ["Qd", "9c"],
    effectiveStack: "22 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-sb",
    explanation:
      "Q9o je v heads-up blind souboji dost silna handa na open. Jam by zbytecne riskoval stack proti normalni obrane.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-72o",
    category: "SB_OPEN",
    title: "SB bottom fold",
    prompt:
      "MTT, efektivne 19 BB. Vse foldne k tobe na SB s 72o. BB neni vyrazne tight. Jaka je vychozi akce?",
    heroHand: ["7h", "2c"],
    effectiveStack: "19 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-open-sb",
    explanation:
      "72o je i v SB prilis nizko. Bez silneho exploitu proti BB je fold standard.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-btn-k4s",
    category: "DEFEND",
    title: "BB defend proti BTN open",
    prompt:
      "MTT, efektivne 22 BB. BTN otevre 2.5x, jsi na BB s K4s. Jaka je vychozi akce?",
    heroHand: ["Kc", "4c"],
    effectiveStack: "22 BB",
    potLabel: "BTN open 2.5x",
    seats: [
      { position: "BTN", label: "Open 2.5x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2-5x",
    explanation:
      "K4s je suited handa s dostatecnou hratelnosti proti BTN. Proti 2.5x patri do defenzivni range.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-btn-j7s",
    category: "DEFEND",
    title: "BB defend J7s",
    prompt:
      "MTT, efektivne 20 BB. BTN otevre 2.2x, SB fold, jsi na BB s J7s. Jaka je vychozi akce?",
    heroHand: ["Js", "7s"],
    effectiveStack: "20 BB",
    potLabel: "BTN open 2.2x",
    seats: [
      { position: "BTN", label: "Open 2.2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2-2x",
    explanation:
      "J7s ma proti malemu BTN openu dost equity a hratelnosti. Fold by zahazoval prilis mnoho blindu.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-btn-q3o",
    category: "DEFEND",
    title: "BB fold Q3o",
    prompt:
      "MTT, efektivne 21 BB. BTN otevre 2.5x, SB fold, jsi na BB s Q3o. Jaka je vychozi akce?",
    heroHand: ["Qh", "3d"],
    effectiveStack: "21 BB",
    potLabel: "BTN open 2.5x",
    seats: [
      { position: "BTN", label: "Open 2.5x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2-5x",
    explanation:
      "Q3o je proti 2.5x open slabsi nez vypada. Offsuit kicker realizuje spatne a handa casto dominuje sama sebe.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-sb-t6o",
    category: "DEFEND",
    title: "BB defend BvB T6o",
    prompt:
      "MTT, efektivne 23 BB. SB otevre 2.5x, jsi na BB s T6o. Jaka je vychozi akce?",
    heroHand: ["Ts", "6d"],
    effectiveStack: "23 BB",
    potLabel: "SB open 2.5x",
    seats: [
      { position: "SB", label: "Open 2.5x" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-sb-2-5x",
    explanation:
      "Proti SB openu hrajeme postflop v pozici a dostavame dobrou cenu. T6o je rozumny defend, hlavne proti standardnimu souperi.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-co-a2o",
    category: "DEFEND",
    title: "BB fold A2o vs CO",
    prompt:
      "MTT, efektivne 20 BB. CO otevre 2.3x, ostatni fold, jsi na BB s A2o. Jaka je vychozi akce?",
    heroHand: ["Ad", "2c"],
    effectiveStack: "20 BB",
    potLabel: "CO open 2.3x",
    seats: [
      { position: "CO", label: "Open 2.3x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-co-2-3x",
    explanation:
      "A2o ma sice eso blocker, ale po callu casto hraje dominovanou top pair. Proti CO je default spis fold.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-co-a9s",
    category: "ISO",
    title: "CO iso limp A9s",
    prompt:
      "MTT, efektivne 25 BB. UTG limpne, fold k tobe na CO s A9s. Za tebou jsou bezni hraci. Jaka je vychozi akce?",
    heroHand: ["Ah", "9h"],
    effectiveStack: "25 BB",
    potLabel: "UTG limp",
    seats: [
      { position: "UTG", label: "Limp" },
      { position: "CO", label: "Hero", isHero: true },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-co-hj-limp",
    explanation:
      "A9s je prilis silne na pasivni overlimp. Iso raise bere iniciativu a casto vyhraje pot uz pred flopem.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-btn-kjo",
    category: "ISO",
    title: "BTN iso KJo",
    prompt:
      "MTT, efektivne 24 BB. HJ limpne, CO fold, jsi na BTN s KJo. Jaka je vychozi akce?",
    heroHand: ["Ks", "Jd"],
    effectiveStack: "24 BB",
    potLabel: "HJ limp",
    seats: [
      { position: "HJ", label: "Limp" },
      { position: "CO", label: "Fold" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-btn-limp",
    explanation:
      "KJo na BTN dobre dominuje slabsi kingy a jacky v limp range. Raise je lepsi nez call bez iniciativy.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-sb-54s",
    category: "ISO",
    title: "SB fold nizky suited connector vs limp",
    prompt:
      "MTT, efektivne 18 BB. BTN limpne, jsi na SB s 54s. BB je aktivni. Jaka je vychozi akce?",
    heroHand: ["5c", "4c"],
    effectiveStack: "18 BB",
    potLabel: "BTN limp",
    seats: [
      { position: "BTN", label: "Limp" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-iso-sb-vs-btn-limp",
    explanation:
      "54s vypada hratelne, ale ze SB bude casto mimo pozici a stack neni hluboky. Default je fold bez specialni dynamiky.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-bb-a5s-btn",
    category: "REJAM",
    title: "BB rejam A5s vs BTN",
    prompt:
      "MTT, efektivne 17 BB. BTN otevre 2.2x, SB fold, jsi na BB s A5s. Jaka je vychozi akce?",
    heroHand: ["As", "5s"],
    effectiveStack: "17 BB",
    potLabel: "BTN open 2.2x",
    seats: [
      { position: "BTN", label: "Open 2.2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-btn",
    explanation:
      "A5s blokuje silna esa a pri callu ma slusnou equity. Proti sirokemu BTN openu je rejam standardni soucast strategie.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-bb-k7s-co",
    category: "REJAM",
    title: "BB neprehanet K7s vs CO",
    prompt:
      "MTT, efektivne 18 BB. CO otevre 2.3x, ostatni fold, jsi na BB s K7s. Jaka je vychozi akce?",
    heroHand: ["Kh", "7h"],
    effectiveStack: "18 BB",
    potLabel: "CO open 2.3x",
    seats: [
      { position: "CO", label: "Open 2.3x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-co",
    explanation:
      "K7s nema tolik blocker hodnoty ani equity proti CO call range. Call je casto lepsi default nez rejam.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-sb-66-co",
    category: "REJAM",
    title: "SB rejam 66 vs CO",
    prompt:
      "MTT, efektivne 16 BB. CO otevre 2.2x, BTN fold, jsi na SB s 66. Jaka je vychozi akce?",
    heroHand: ["6s", "6d"],
    effectiveStack: "16 BB",
    potLabel: "CO open 2.2x",
    seats: [
      { position: "CO", label: "Open 2.2x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-sb-vs-co",
    explanation:
      "66 ma dobrou equity, ale spatne se hraje callem mimo pozici. Rejam maximalizuje fold equity a realizaci.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-btn-kqo-hj",
    category: "REJAM",
    title: "BTN KQo vs HJ open",
    prompt:
      "MTT, efektivne 19 BB. HJ otevre 2.2x, CO fold, jsi na BTN s KQo. Jaka je vychozi akce?",
    heroHand: ["Ks", "Qd"],
    effectiveStack: "19 BB",
    potLabel: "HJ open 2.2x",
    seats: [
      { position: "HJ", label: "Open 2.2x" },
      { position: "CO", label: "Fold" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-20-rejam-btn-vs-co-hj",
    explanation:
      "Proti HJ openu je KQo casto moc dobra na fold, ale ne vzdy dost dobra na cisty rejam. Call v pozici je solidni default.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-bb-aJo-co",
    category: "REJAM",
    title: "BB AJo vs CO open",
    prompt:
      "MTT, efektivne 15 BB. CO otevre 2x, ostatni fold, jsi na BB s AJo. Jaka je vychozi akce?",
    heroHand: ["Ac", "Jh"],
    effectiveStack: "15 BB",
    potLabel: "CO open 2x",
    seats: [
      { position: "CO", label: "Open 2x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-co",
    explanation:
      "AJo je pri 15 BB velmi silna handa proti CO openu. Rejam bere fold equity a vyhne se slozitemu postflopu mimo pozici.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-sb-qts-btn",
    category: "REJAM",
    title: "SB QTs vs BTN open",
    prompt:
      "MTT, efektivne 18 BB. BTN otevre 2x, jsi na SB s QTs. BB zatim bez tendenci. Jaka je vychozi akce?",
    heroHand: ["Qs", "Ts"],
    effectiveStack: "18 BB",
    potLabel: "BTN open 2x",
    seats: [
      { position: "BTN", label: "Open 2x" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-sb-vs-btn",
    explanation:
      "QTs ma slusnou equity proti callum a blokuje cast pokracovaci range. Ze SB je rejam casto cistsi nez call mimo pozici.",
  }),
  makeSpot({
    id: "mtt-21-25-rejam-bb-77-btn",
    category: "REJAM",
    title: "BB call 77 vs BTN open pri 24 BB",
    prompt:
      "MTT, efektivne 24 BB. BTN otevre 2.2x, SB fold, jsi na BB se 77. Jaka je vychozi akce?",
    heroHand: ["7s", "7d"],
    effectiveStack: "24 BB",
    potLabel: "BTN open 2.2x",
    seats: [
      { position: "BTN", label: "Open 2.2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-btn",
    explanation:
      "Pri 24 BB je 77 casteji call nez jam. Udrzime stabilnejsi stack a vyuzijeme realizaci equity po flopu.",
  }),
  makeSpot({
    id: "mtt-21-25-rejam-bb-a9o-co",
    category: "REJAM",
    title: "BB fold A9o vs CO open pri 23 BB",
    prompt:
      "MTT, efektivne 23 BB. CO otevre 2.2x, BTN a SB fold, jsi na BB s A9o. Jaka je vychozi akce?",
    heroHand: ["Ah", "9c"],
    effectiveStack: "23 BB",
    potLabel: "CO open 2.2x",
    seats: [
      { position: "CO", label: "Open 2.2x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-co",
    explanation:
      "Na 23 BB A9o casto nema dost hodnoty na reshove proti CO. Lepsi default je fold a cekat na silnejsi spot.",
  }),
  makeSpot({
    id: "mtt-21-25-rejam-sb-66-co",
    category: "REJAM",
    title: "SB call 66 vs CO open pri 25 BB",
    prompt:
      "MTT, efektivne 25 BB. CO otevre 2.2x, BTN fold, jsi na SB se 66. Jaka je vychozi akce?",
    heroHand: ["6c", "6d"],
    effectiveStack: "25 BB",
    potLabel: "CO open 2.2x",
    seats: [
      { position: "CO", label: "Open 2.2x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-20-rejam-sb-vs-co",
    explanation:
      "Pri 25 BB uz 66 casto nepushujeme automaticky. Call drzi pot kontrolovanejsi a nechava prostor na postflop realizaci.",
  }),
  makeSpot({
    id: "mtt-21-25-rejam-btn-ajo-hj",
    category: "REJAM",
    title: "BTN call AJo vs HJ open pri 22 BB",
    prompt:
      "MTT, efektivne 22 BB. HJ otevre 2.2x, CO fold, jsi na BTN s AJo. Jaka je vychozi akce?",
    heroHand: ["As", "Jd"],
    effectiveStack: "22 BB",
    potLabel: "HJ open 2.2x",
    seats: [
      { position: "HJ", label: "Open 2.2x" },
      { position: "CO", label: "Fold" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-20-rejam-btn-vs-co-hj",
    explanation:
      "AJo je na 22 BB casto vhodnejsi na call v pozici nez na cisty reshove. Zachovava to EV a snizuje variance.",
  }),
  makeSpot({
    id: "mtt-21-25-rejam-sb-ato-btn",
    category: "REJAM",
    title: "SB fold ATo vs BTN open pri 24 BB",
    prompt:
      "MTT, efektivne 24 BB. BTN otevre 2x, jsi na SB s ATo. BB je bez specifickych tendenci. Jaka je vychozi akce?",
    heroHand: ["Ac", "Td"],
    effectiveStack: "24 BB",
    potLabel: "BTN open 2x",
    seats: [
      { position: "BTN", label: "Open 2x" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-20-rejam-sb-vs-btn",
    explanation:
      "Na vyssim stacku uz ATo neni automaticky reshove kandidat. Bez exploitu je konzervativni fold standardni linie.",
  }),
  makeSpot({
    id: "mtt-21-25-rejam-bb-kjo-sb",
    category: "REJAM",
    title: "BB fold KJo vs SB open pri 23 BB",
    prompt:
      "MTT, efektivne 23 BB. SB otevre 2.5x, jsi na BB s KJo. Jaka je vychozi akce?",
    heroHand: ["Kh", "Jc"],
    effectiveStack: "23 BB",
    potLabel: "SB open 2.5x",
    seats: [
      { position: "SB", label: "Open 2.5x" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-sb",
    explanation:
      "KJo je pri 23 BB proti SB openu uz casto mimo profitabilni jam cast. Fold je default bez silne read-based upravy.",
  }),
  makeSpot({
    id: "mtt-21-25-rejam-co-ajo-hj",
    category: "REJAM",
    title: "CO call AJo vs HJ open pri 21 BB",
    prompt:
      "MTT, efektivne 21 BB. HJ otevre 2.2x, jsi na CO s AJo. Jaka je vychozi akce?",
    heroHand: ["Ad", "Js"],
    effectiveStack: "21 BB",
    potLabel: "HJ open 2.2x",
    seats: [
      { position: "HJ", label: "Open 2.2x" },
      { position: "CO", label: "Hero", isHero: true },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-20-rejam-co-vs-hj",
    explanation:
      "Na 21 BB ma AJo casto vetsi hodnotu jako call nez jako reshove. Drzime flexibilni postflop plan a mene riskujeme turnajovy zivot.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-a2o",
    category: "SB_OPEN",
    title: "SB open A2o",
    prompt:
      "MTT, efektivne 20 BB. Vse foldne k tobe na SB s A2o. BB defenduje standardne. Jaka je vychozi akce?",
    heroHand: ["Ad", "2s"],
    effectiveStack: "20 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-sb",
    explanation:
      "A2o ma blocker a dost equity na BvB open. Jam by byl bez specificke dynamiky zbytecne hruby.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-k4o",
    category: "SB_OPEN",
    title: "SB mix open K4o",
    prompt:
      "MTT, efektivne 24 BB. Vse foldne k tobe na SB s K4o. BB neni vyrazne loose. Jaka je vychozi akce?",
    heroHand: ["Ks", "4d"],
    effectiveStack: "24 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-sb",
    explanation:
      "K4o neni krasna handa, ale v SB proti jedinemu souperi funguje jako nizkofrekvencni open. Default proti normalnimu BB je open.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-j8o",
    category: "SB_OPEN",
    title: "SB open J8o",
    prompt:
      "MTT, efektivne 18 BB. Vse foldne k tobe na SB s J8o. BB brani rozumne. Jaka je vychozi akce?",
    heroHand: ["Jh", "8c"],
    effectiveStack: "18 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-sb",
    explanation:
      "J8o je nad uplnym spodkem SB range. Otevirame mensim sizingem, ne jamem.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-94o",
    category: "SB_OPEN",
    title: "SB fold 94o",
    prompt:
      "MTT, efektivne 22 BB. Vse foldne k tobe na SB s 94o. BB neni prilis tight. Jaka je vychozi akce?",
    heroHand: ["9s", "4h"],
    effectiveStack: "22 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-open-sb",
    explanation:
      "94o je prilis nizko a spatne realizuje equity. Pokud BB neni prehnane tight, fold je cisty default.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-86s",
    category: "SB_OPEN",
    title: "SB open 86s",
    prompt:
      "MTT, efektivne 25 BB. Vse foldne k tobe na SB s 86s. Jaka je vychozi akce?",
    heroHand: ["8c", "6c"],
    effectiveStack: "25 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeProfileId: "mtt-15-25-open-sb",
    explanation:
      "86s dobre realizuje equity a muze trefit silne draw. Mensi open je prirozeny default.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-2x-btn-q6s",
    category: "DEFEND_2X",
    title: "BB defend Q6s vs BTN 2x",
    prompt:
      "MTT, efektivne 20 BB. BTN minraisne 2x, SB fold, jsi na BB s Q6s. Jaka je vychozi akce?",
    heroHand: ["Qd", "6d"],
    effectiveStack: "20 BB",
    potLabel: "BTN open 2x",
    seats: [
      { position: "BTN", label: "Open 2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2x",
    explanation:
      "Q6s ma proti 2x open dostatecnou cenu a hratelnost. Fold by byl proti minraisu prilis tight.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-2x-btn-84s",
    category: "DEFEND_2X",
    title: "BB defend 84s vs BTN 2x",
    prompt:
      "MTT, efektivne 22 BB. BTN otevre 2x, SB fold, jsi na BB s 84s. Jaka je vychozi akce?",
    heroHand: ["8s", "4s"],
    effectiveStack: "22 BB",
    potLabel: "BTN open 2x",
    seats: [
      { position: "BTN", label: "Open 2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2x",
    explanation:
      "84s je okrajovy, ale proti 2x sizingu se casto brani. Offsuit varianta by uz byla fold.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-2x-co-j9o",
    category: "DEFEND_2X",
    title: "BB defend J9o vs CO 2x",
    prompt:
      "MTT, efektivne 24 BB. CO otevre 2x, BTN a SB fold, jsi na BB s J9o. Jaka je vychozi akce?",
    heroHand: ["Jc", "9h"],
    effectiveStack: "24 BB",
    potLabel: "CO open 2x",
    seats: [
      { position: "CO", label: "Open 2x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-co-2x",
    explanation:
      "J9o je proti CO 2x na hranici, ale casto obhajitelny defend. Proti vetsimu sizingu by fold daval vetsi smysl.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-2x-sb-62o",
    category: "DEFEND_2X",
    title: "BB fold 62o vs SB 2x",
    prompt:
      "MTT, efektivne 20 BB. SB otevre 2x, jsi na BB s 62o. Jaka je vychozi akce?",
    heroHand: ["6d", "2c"],
    effectiveStack: "20 BB",
    potLabel: "SB open 2x",
    seats: [
      { position: "SB", label: "Open 2x" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-sb-2x",
    explanation:
      "62o nema blocker, konektivitu ani suited hodnotu. I za dobrou cenu muze zustat fold.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-2x-btn-a7o",
    category: "DEFEND_2X",
    title: "BB defend A7o vs BTN 2x",
    prompt:
      "MTT, efektivne 19 BB. BTN otevre 2x, SB fold, jsi na BB s A7o. Jaka je vychozi akce?",
    heroHand: ["Ah", "7d"],
    effectiveStack: "19 BB",
    potLabel: "BTN open 2x",
    seats: [
      { position: "BTN", label: "Open 2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2x",
    explanation:
      "A7o dominuje cast BTN range a dostava dobrou cenu. Call je standardni default proti 2x.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-co-qjo",
    category: "ISO",
    title: "CO iso QJo",
    prompt:
      "MTT, efektivne 23 BB. MP limpne, jsi na CO s QJo. Za tebou jsou standardni stacky. Jaka je vychozi akce?",
    heroHand: ["Qh", "Jc"],
    effectiveStack: "23 BB",
    potLabel: "MP limp",
    seats: [
      { position: "MP", label: "Limp" },
      { position: "CO", label: "Hero", isHero: true },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-co-hj-limp",
    explanation:
      "QJo je dost silna na izolaci limpera z CO. Limp behind by zbytecne poustel blindy levne do hry.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-btn-a4s",
    category: "ISO",
    title: "BTN iso A4s",
    prompt:
      "MTT, efektivne 21 BB. CO limpne, jsi na BTN s A4s. Jaka je vychozi akce?",
    heroHand: ["As", "4s"],
    effectiveStack: "21 BB",
    potLabel: "CO limp",
    seats: [
      { position: "CO", label: "Limp" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-btn-limp",
    explanation:
      "A4s je velmi dobry iso kandidát. Raise vyuzije pozici a fold equity proti limperovi.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-btn-k8o",
    category: "ISO",
    title: "BTN fold K8o vs limp",
    prompt:
      "MTT, efektivne 20 BB. HJ limpne, CO fold, jsi na BTN s K8o. Jaka je vychozi akce?",
    heroHand: ["Kd", "8c"],
    effectiveStack: "20 BB",
    potLabel: "HJ limp",
    seats: [
      { position: "HJ", label: "Limp" },
      { position: "CO", label: "Fold" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-iso-btn-limp",
    explanation:
      "K8o je casto prilis slabe na izolaci a call muze vytvorit multiway pot bez iniciativy. Fold je rozumny default.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-bb-q9s",
    category: "ISO",
    title: "BB raise vs SB limp Q9s",
    prompt:
      "MTT, efektivne 22 BB. SB limpne, jsi na BB s Q9s. Jaka je vychozi akce?",
    heroHand: ["Qs", "9s"],
    effectiveStack: "22 BB",
    potLabel: "SB limp",
    seats: [
      { position: "SB", label: "Limp" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["CHECK", "RAISE", "FOLD"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-bb-vs-sb-limp",
    explanation:
      "Q9s je dost silna na raise proti SB limpu. Check je hratelny, ale default exploit proti limpu je casto izolace.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-bb-74o",
    category: "ISO",
    title: "BB check 74o vs SB limp",
    prompt:
      "MTT, efektivne 25 BB. SB limpne, jsi na BB s 74o. Jaka je vychozi akce?",
    heroHand: ["7c", "4d"],
    effectiveStack: "25 BB",
    potLabel: "SB limp",
    seats: [
      { position: "SB", label: "Limp" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["CHECK", "RAISE", "FOLD"],
    correctAction: "CHECK",
    rangeProfileId: "mtt-15-25-iso-bb-vs-sb-limp",
    explanation:
      "BB nemusi proti SB limpu raiseovat vsechno. 74o ma malo equity a zadny dobry blocker, check je nejlepsi.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-bb-22-btn",
    category: "REJAM",
    title: "BB 22 vs BTN open",
    prompt:
      "MTT, efektivne 16 BB. BTN otevre 2x, SB fold, jsi na BB s 22. Jaka je vychozi akce?",
    heroHand: ["2c", "2d"],
    effectiveStack: "16 BB",
    potLabel: "BTN open 2x",
    seats: [
      { position: "BTN", label: "Open 2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-btn",
    explanation:
      "22 se po callu spatne realizuje, ale all-in ma fold equity a proti callum ma casto coinflip equity.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-sb-a9o-btn",
    category: "REJAM",
    title: "SB A9o vs BTN open",
    prompt:
      "MTT, efektivne 17 BB. BTN otevre 2.2x, jsi na SB s A9o. Jaka je vychozi akce?",
    heroHand: ["Ac", "9d"],
    effectiveStack: "17 BB",
    potLabel: "BTN open 2.2x",
    seats: [
      { position: "BTN", label: "Open 2.2x" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-sb-vs-btn",
    explanation:
      "A9o blokuje cast silnych callu a dobre stoji proti BTN steal range. Ze SB nechceme casto callovat mimo pozici.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-btn-44-co",
    category: "REJAM",
    title: "BTN 44 vs CO open",
    prompt:
      "MTT, efektivne 18 BB. CO otevre 2.2x, jsi na BTN se 44. Jaka je vychozi akce?",
    heroHand: ["4s", "4h"],
    effectiveStack: "18 BB",
    potLabel: "CO open 2.2x",
    seats: [
      { position: "CO", label: "Open 2.2x" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-btn-vs-co-hj",
    explanation:
      "44 nechce casto callovat a hrat multiway. Rejam vyuzije fold equity a zabere dead money.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-co-ats-hj",
    category: "REJAM",
    title: "CO ATs vs HJ open",
    prompt:
      "MTT, efektivne 19 BB. HJ otevre 2.2x, jsi na CO s ATs. Jaka je vychozi akce?",
    heroHand: ["Ah", "Th"],
    effectiveStack: "19 BB",
    potLabel: "HJ open 2.2x",
    seats: [
      { position: "HJ", label: "Open 2.2x" },
      { position: "CO", label: "Hero", isHero: true },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-co-vs-hj",
    explanation:
      "ATs je dost silna na tlak proti HJ a blokuje cast nejhorsich callu. Call je mozny, ale rejam je cisty default.",
  }),
  makeSpot({
    id: "mtt-15-25-rejam-bb-kjo-sb",
    category: "REJAM",
    title: "BB KJo vs SB open",
    prompt:
      "MTT, efektivne 15 BB. SB otevre 2.5x, jsi na BB s KJo. Jaka je vychozi akce?",
    heroHand: ["Kd", "Js"],
    effectiveStack: "15 BB",
    potLabel: "SB open 2.5x",
    seats: [
      { position: "SB", label: "Open 2.5x" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "JAM"],
    correctAction: "JAM",
    rangeProfileId: "mtt-15-20-rejam-bb-vs-sb",
    explanation:
      "KJo je proti SB open range velmi silna. Pri 15 BB rejam dobre realizuje equity a tresta siroky open.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-co-tt",
    category: "ISO",
    title: "CO iso TT vs UTG limp",
    prompt:
      "MTT, efektivne 17 BB. UTG limpne, jsi na CO s TT a za tebou jsou bezni hraci. Jaka je vychozi akce?",
    heroHand: ["Tc", "Td"],
    effectiveStack: "17 BB",
    potLabel: "UTG limp",
    seats: [
      { position: "UTG", label: "Limp" },
      { position: "CO", label: "Hero", isHero: true },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-co-hj-limp",
    explanation:
      "TT je pri 17 BB clear iso. Pasivni call by zbytecne pustil blindy do potu a snizil fold equity proti limp range.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-hj-77",
    category: "ISO",
    title: "HJ fold 77 vs UTG limp",
    prompt:
      "MTT, efektivne 19 BB. UTG limpne, jsi na HJ s 77 a za tebou jsou 4 hraci. Jaka je vychozi akce?",
    heroHand: ["7c", "7s"],
    effectiveStack: "19 BB",
    potLabel: "UTG limp",
    seats: [
      { position: "UTG", label: "Limp" },
      { position: "HJ", label: "Hero", isHero: true },
      { position: "CO", label: "CO" },
      { position: "BTN", label: "BTN" },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-iso-co-hj-limp",
    explanation:
      "Pri 15-20 BB s sesti hraci za sebou je 77 z HJ casto fold. Iso nesnasi vetsi field a postflop hra mimo pozici je tvrda.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-btn-qjo",
    category: "ISO",
    title: "BTN iso QJo vs CO limp",
    prompt:
      "MTT, efektivne 17 BB. CO limpne, jsi na BTN s QJo. Jaka je vychozi akce?",
    heroHand: ["Qd", "Js"],
    effectiveStack: "17 BB",
    potLabel: "CO limp",
    seats: [
      { position: "CO", label: "Limp" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-btn-limp",
    explanation:
      "QJo dominuje cast CO limp range a v pozici dobre hraje postflop. Iso je standardni default i pri kratsim stacku.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-btn-a4s-vs-hj",
    category: "ISO",
    title: "BTN fold A4s vs HJ limp (shallow)",
    prompt:
      "MTT, efektivne 18 BB. HJ limpne, CO fold, jsi na BTN s A4s. Jaka je vychozi akce?",
    heroHand: ["As", "4s"],
    effectiveStack: "18 BB",
    potLabel: "HJ limp",
    seats: [
      { position: "HJ", label: "Limp" },
      { position: "CO", label: "Fold" },
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-iso-btn-limp",
    explanation:
      "Pri 21-25 BB by A4s byl iso, ale pri 15-20 BB ztraci realizovatelnost a casto skonci dominovany. Fold je tady cisty default.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-sb-87s",
    category: "ISO",
    title: "SB fold 87s vs BTN limp",
    prompt:
      "MTT, efektivne 17 BB. BTN limpne, jsi na SB s 87s. Jaka je vychozi akce?",
    heroHand: ["8h", "7h"],
    effectiveStack: "17 BB",
    potLabel: "BTN limp",
    seats: [
      { position: "BTN", label: "Limp" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-iso-sb-vs-btn-limp",
    explanation:
      "87s vypada hratelne, ale ze SB pri 15-20 BB casto realizuje malo equity. Fold zabranuje volatilnimu potu mimo pozici.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-bb-55-vs-sb",
    category: "ISO",
    title: "BB check 55 vs SB limp",
    prompt:
      "MTT, efektivne 18 BB. SB limpne, jsi na BB s 55. Jaka je vychozi akce?",
    heroHand: ["5c", "5d"],
    effectiveStack: "18 BB",
    potLabel: "SB limp",
    seats: [
      { position: "SB", label: "Limp" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["CHECK", "RAISE", "FOLD"],
    correctAction: "CHECK",
    rangeProfileId: "mtt-15-25-iso-bb-vs-sb-limp",
    explanation:
      "Pri 15-20 BB raisuje BB selektivneji. 55 ma slusnou equity, ale set mining v levnem potu je hodnotnejsi nez tlak proti tightnejsi SB call range.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-btn-88-2-5x",
    category: "DEFEND",
    title: "BB defend 88 vs BTN 2.5x",
    prompt:
      "MTT, efektivne 22 BB. BTN otevre 2.5x, SB fold, jsi na BB s 88. Jaka je vychozi akce?",
    heroHand: ["8c", "8d"],
    effectiveStack: "22 BB",
    potLabel: "BTN open 2.5x",
    seats: [
      { position: "BTN", label: "Open 2.5x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2-5x",
    explanation:
      "88 ma slusnou equity proti BTN range, ale pri 22 BB realizuje hodnotu lepe callem nez 3betem. Rejam by zbytecne riskoval proti silne 4bet range.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-btn-k2o-2-5x",
    category: "DEFEND",
    title: "BB fold K2o vs BTN 2.5x",
    prompt:
      "MTT, efektivne 23 BB. BTN otevre 2.5x, SB fold, jsi na BB s K2o. Jaka je vychozi akce?",
    heroHand: ["Kh", "2d"],
    effectiveStack: "23 BB",
    potLabel: "BTN open 2.5x",
    seats: [
      { position: "BTN", label: "Open 2.5x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2-5x",
    explanation:
      "K2o ma blocker, ale offsuit kicker realizuje spatne a casto je dominovany. Proti 2.5x sizingu uz tahle handa cisty fold.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-btn-96s-2-2x",
    category: "DEFEND",
    title: "BB defend 96s vs BTN 2.2x",
    prompt:
      "MTT, efektivne 24 BB. BTN otevre 2.2x, SB fold, jsi na BB s 96s. Jaka je vychozi akce?",
    heroHand: ["9c", "6c"],
    effectiveStack: "24 BB",
    potLabel: "BTN open 2.2x",
    seats: [
      { position: "BTN", label: "Open 2.2x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2-2x",
    explanation:
      "Pri 2.2x sizingu dostava BB lepsi cenu a 96s zacina hratelne defendovat. Suited konektivita kompenzuje slabou top kartu.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-co-87s-2-3x",
    category: "DEFEND",
    title: "BB defend 87s vs CO 2.3x",
    prompt:
      "MTT, efektivne 25 BB. CO otevre 2.3x, BTN a SB fold, jsi na BB s 87s. Jaka je vychozi akce?",
    heroHand: ["8s", "7s"],
    effectiveStack: "25 BB",
    potLabel: "CO open 2.3x",
    seats: [
      { position: "CO", label: "Open 2.3x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-co-2-3x",
    explanation:
      "87s ma vybornou postflop hratelnost a dost equity proti CO open range. Call dostava cisty default vyber.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-sb-32o-2-5x",
    category: "DEFEND",
    title: "BB fold 32o vs SB 2.5x",
    prompt:
      "MTT, efektivne 22 BB. SB otevre 2.5x, jsi na BB s 32o. Jaka je vychozi akce?",
    heroHand: ["3c", "2d"],
    effectiveStack: "22 BB",
    potLabel: "SB open 2.5x",
    seats: [
      { position: "SB", label: "Open 2.5x" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-sb-2-5x",
    explanation:
      "I BvB dynamika ma sve dno. 32o nema blocker, konektivitu ani suited hodnotu a proti 2.5x sizingu uz patri pryc.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-btn-j8o-2-5x",
    category: "DEFEND",
    title: "BB fold J8o vs BTN 2.5x (shallow)",
    prompt:
      "MTT, efektivne 18 BB. BTN otevre 2.5x, SB fold, jsi na BB s J8o. Jaka je vychozi akce?",
    heroHand: ["Jh", "8c"],
    effectiveStack: "18 BB",
    potLabel: "BTN open 2.5x",
    seats: [
      { position: "BTN", label: "Open 2.5x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-btn-2-5x",
    explanation:
      "J8o by pri 21-25 BB jeste defendoval, ale pri 15-20 BB s mensim SPR a horsi realizaci uz patri pryc proti 2.5x sizingu.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-2x-co-87s",
    category: "DEFEND_2X",
    title: "BB defend 87s vs CO 2x",
    prompt:
      "MTT, efektivne 17 BB. CO otevre 2x, BTN a SB fold, jsi na BB s 87s. Jaka je vychozi akce?",
    heroHand: ["8s", "7s"],
    effectiveStack: "17 BB",
    potLabel: "CO open 2x",
    seats: [
      { position: "CO", label: "Open 2x" },
      { position: "BTN", label: "Fold" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    rangeProfileId: "mtt-15-25-bb-defend-co-2x",
    explanation:
      "87s ma vybornou postflop hratelnost a proti minraisu z CO dostava dost dobrou cenu i pri 15-20 BB. Standardni defend.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-sb-k3o-2-5x",
    category: "DEFEND",
    title: "BB fold K3o vs SB 2.5x (shallow)",
    prompt:
      "MTT, efektivne 17 BB. SB otevre 2.5x, jsi na BB s K3o. Jaka je vychozi akce?",
    heroHand: ["Kc", "3d"],
    effectiveStack: "17 BB",
    potLabel: "SB open 2.5x",
    seats: [
      { position: "SB", label: "Open 2.5x" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-sb-2-5x",
    explanation:
      "Pri 15-20 BB BvB cast slabsich offsuit kombinaci uz folduje. K3o ma blocker, ale offsuit kicker realizuje spatne v melkem stacku.",
  }),
  makeSpot({
    id: "mtt-15-25-bb-defend-2x-sb-52o",
    category: "DEFEND_2X",
    title: "BB fold 52o vs SB 2x",
    prompt:
      "MTT, efektivne 22 BB. SB otevre 2x, jsi na BB s 52o. Jaka je vychozi akce?",
    heroHand: ["5d", "2h"],
    effectiveStack: "22 BB",
    potLabel: "SB open 2x",
    seats: [
      { position: "SB", label: "Open 2x" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "FOLD",
    rangeProfileId: "mtt-15-25-bb-defend-sb-2x",
    explanation:
      "I za vybornou cenu proti minraisu ma 52o tak malo equity a realizacni hodnoty, ze patri do uzkeho jadra cistych foldu.",
  }),
  makeSpot({
    id: "mtt-15-25-iso-sb-kjo",
    category: "ISO",
    title: "SB iso KJo vs BTN limp",
    prompt:
      "MTT, efektivne 24 BB. BTN limpne, jsi na SB s KJo. Jaka je vychozi akce?",
    heroHand: ["Kh", "Jd"],
    effectiveStack: "24 BB",
    potLabel: "BTN limp",
    seats: [
      { position: "BTN", label: "Limp" },
      { position: "SB", label: "Hero", isHero: true },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "RAISE",
    rangeProfileId: "mtt-15-25-iso-sb-vs-btn-limp",
    explanation:
      "KJo dominuje cast BTN limp range a izolace zapina jak fold equity, tak postflop iniciativu. Pasivni call mimo pozici by promarnil hodnotu handy.",
  }),
] as const satisfies readonly TrainingSpot[];
