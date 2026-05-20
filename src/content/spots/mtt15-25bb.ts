import type { ActionId, SpotCategory, TrainingSpot } from "../../domain/spot";

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
  rangeTitle: string;
  rangeSummary: string;
  rangeCells: TrainingSpot["range"]["cells"];
  explanation: string;
};

function makeSpot(input: SpotInput): TrainingSpot {
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
    range: {
      title: input.rangeTitle,
      summary: input.rangeSummary,
      cells: input.rangeCells,
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
    rangeTitle: "BTN open 20 BB",
    rangeSummary:
      "Button otevira siroce, ale vetsinu hratelnych kombinaci stale preferuje otevrit mensim sizingem.",
    rangeCells: [
      { hand: "A8o", action: "OPEN", weight: "pure" },
      { hand: "A2o", action: "OPEN", weight: "mix" },
      { hand: "K7s", action: "OPEN", weight: "mix" },
      { hand: "Q5o", action: "FOLD", weight: "pure" },
      { hand: "22", action: "OPEN", weight: "pure" },
    ],
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
    rangeTitle: "BTN open suited kingove",
    rangeSummary:
      "Suited kingove maji dobrou hratelnost a blocker efekt, proto casto zustavaji v open range.",
    rangeCells: [
      { hand: "K5s", action: "OPEN", weight: "pure" },
      { hand: "K2s", action: "OPEN", weight: "mix" },
      { hand: "K8o", action: "OPEN", weight: "mix" },
      { hand: "Q4o", action: "FOLD", weight: "pure" },
    ],
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
    rangeTitle: "BTN marginalni offsuit handy",
    rangeSummary:
      "Nejslabsi offsuit queen kombinace casto nemaji dost equity ani realizace pro default open.",
    rangeCells: [
      { hand: "Q4o", action: "FOLD", weight: "pure" },
      { hand: "Q8o", action: "OPEN", weight: "mix" },
      { hand: "Q5s", action: "OPEN", weight: "mix" },
      { hand: "J5o", action: "FOLD", weight: "pure" },
    ],
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
    rangeTitle: "CO open 24 BB",
    rangeSummary:
      "CO oteviraci range je uzsi nez BTN, ale K9s je porad standardni open.",
    rangeCells: [
      { hand: "K9s", action: "OPEN", weight: "pure" },
      { hand: "K5s", action: "OPEN", weight: "mix" },
      { hand: "Q9o", action: "FOLD", weight: "mix" },
      { hand: "A2s", action: "OPEN", weight: "pure" },
    ],
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
    rangeTitle: "CO offsuit hranice",
    rangeSummary:
      "Slabe offsuit broadway-ish handy z CO casto trpi proti callum a 3betum za nami.",
    rangeCells: [
      { hand: "Q8o", action: "FOLD", weight: "pure" },
      { hand: "QTo", action: "OPEN", weight: "pure" },
      { hand: "Q9s", action: "OPEN", weight: "pure" },
      { hand: "K9o", action: "FOLD", weight: "mix" },
    ],
    explanation:
      "Q8o je z CO mimo default open range. BTN a blindy maji dost prostoru nas potrestat.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-q9o",
    category: "OPEN",
    title: "SB open Q9o",
    prompt:
      "MTT, efektivne 22 BB. Vse foldne k tobe na SB, drzis Q9o. BB defenduje standardne. Jaka je vychozi akce?",
    heroHand: ["Qd", "9c"],
    effectiveStack: "22 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    rangeTitle: "SB open vs BB",
    rangeSummary:
      "V BvB otevirame siroce, ale porad typicky mensim sizingem misto zbytecneho jamu.",
    rangeCells: [
      { hand: "Q9o", action: "OPEN", weight: "pure" },
      { hand: "Q5o", action: "OPEN", weight: "mix" },
      { hand: "72o", action: "FOLD", weight: "pure" },
      { hand: "A2o", action: "OPEN", weight: "pure" },
    ],
    explanation:
      "Q9o je v heads-up blind souboji dost silna handa na open. Jam by zbytecne riskoval stack proti normalni obrane.",
  }),
  makeSpot({
    id: "mtt-15-25-open-sb-72o",
    category: "OPEN",
    title: "SB bottom fold",
    prompt:
      "MTT, efektivne 19 BB. Vse foldne k tobe na SB s 72o. BB neni vyrazne tight. Jaka je vychozi akce?",
    heroHand: ["7h", "2c"],
    effectiveStack: "19 BB",
    potLabel: "SB unopened",
    seats: SB_OPEN_SEATS,
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "FOLD",
    rangeTitle: "SB nejslabsi handy",
    rangeSummary:
      "I v BvB maji nejslabsi offsuit kombinace spatnou realizaci a neblokujici strukturu.",
    rangeCells: [
      { hand: "72o", action: "FOLD", weight: "pure" },
      { hand: "82o", action: "FOLD", weight: "pure" },
      { hand: "T4o", action: "OPEN", weight: "mix" },
      { hand: "54s", action: "OPEN", weight: "mix" },
    ],
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
    rangeTitle: "BB defend vs BTN 2.5x",
    rangeSummary:
      "Suited kingove maji proti BTN openum dobrou realizaci equity a casto zustavaji v callovaci casti range.",
    rangeCells: [
      { hand: "K4s", action: "CALL", weight: "pure" },
      { hand: "K2o", action: "FOLD", weight: "pure" },
      { hand: "A5s", action: "RAISE", weight: "mix" },
      { hand: "76s", action: "CALL", weight: "mix" },
      { hand: "Q3o", action: "FOLD", weight: "pure" },
    ],
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
    rangeTitle: "BB defend vs maly BTN open",
    rangeSummary:
      "Proti mensimu sizingu musi BB branit sireji, hlavne suited kombinace s realizaci.",
    rangeCells: [
      { hand: "J7s", action: "CALL", weight: "pure" },
      { hand: "J4s", action: "CALL", weight: "mix" },
      { hand: "J7o", action: "FOLD", weight: "pure" },
      { hand: "T8s", action: "CALL", weight: "pure" },
    ],
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
    rangeTitle: "BB offsuit trash vs BTN",
    rangeSummary:
      "Cast offsuit queen low kombinaci nema dost realizace proti vetsimu BTN sizingu.",
    rangeCells: [
      { hand: "Q3o", action: "FOLD", weight: "pure" },
      { hand: "Q8o", action: "CALL", weight: "mix" },
      { hand: "Q5s", action: "CALL", weight: "pure" },
      { hand: "K2o", action: "FOLD", weight: "pure" },
    ],
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
    rangeTitle: "BB defend vs SB",
    rangeSummary:
      "BvB range jsou siroke a BB realizuje equity v pozici, proto brani i cast offsuit hand.",
    rangeCells: [
      { hand: "T6o", action: "CALL", weight: "mix" },
      { hand: "T8o", action: "CALL", weight: "pure" },
      { hand: "T3o", action: "FOLD", weight: "mix" },
      { hand: "86s", action: "CALL", weight: "pure" },
    ],
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
    rangeTitle: "BB defend vs CO",
    rangeSummary:
      "Proti CO je range silnejsi nez BTN a male offsuit esa casto realizuji spatne.",
    rangeCells: [
      { hand: "A2o", action: "FOLD", weight: "mix" },
      { hand: "A7o", action: "CALL", weight: "mix" },
      { hand: "A2s", action: "CALL", weight: "pure" },
      { hand: "K9s", action: "CALL", weight: "pure" },
    ],
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
    rangeTitle: "Iso vs limp",
    rangeSummary:
      "Silne suited broadway/ace handy chteji izolovat limpera a hrat pot s iniciativou.",
    rangeCells: [
      { hand: "A9s", action: "RAISE", weight: "pure" },
      { hand: "A4s", action: "RAISE", weight: "mix" },
      { hand: "KJo", action: "RAISE", weight: "mix" },
      { hand: "54s", action: "CALL", weight: "mix" },
    ],
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
    rangeTitle: "BTN iso vs limp",
    rangeSummary:
      "BTN muze izolovat siroce diky pozici, hlavne s handami, ktere dominují limp/call range.",
    rangeCells: [
      { hand: "KJo", action: "RAISE", weight: "pure" },
      { hand: "K9o", action: "FOLD", weight: "mix" },
      { hand: "QJo", action: "RAISE", weight: "mix" },
      { hand: "J8s", action: "RAISE", weight: "mix" },
    ],
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
    rangeTitle: "SB vs BTN limp",
    rangeSummary:
      "Ze SB mimo pozici nechceme prilis casto dokompletovavat slabe spekulativni handy pri nizsim stacku.",
    rangeCells: [
      { hand: "54s", action: "FOLD", weight: "mix" },
      { hand: "A8o", action: "RAISE", weight: "pure" },
      { hand: "KTo", action: "RAISE", weight: "mix" },
      { hand: "98s", action: "CALL", weight: "mix" },
    ],
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
    rangeTitle: "BB rejam vs BTN 17 BB",
    rangeSummary:
      "Suited wheel esa jsou dobre rejam kandidaty diky blockeru, equity a fold equity.",
    rangeCells: [
      { hand: "A5s", action: "JAM", weight: "mix" },
      { hand: "A9o", action: "JAM", weight: "mix" },
      { hand: "KQo", action: "JAM", weight: "mix" },
      { hand: "K7s", action: "CALL", weight: "mix" },
    ],
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
    rangeTitle: "BB vs CO open 18 BB",
    rangeSummary:
      "Proti CO je open range silnejsi nez BTN. Cast suited kingu je lepsi realizovat callem nez tlacit all-in.",
    rangeCells: [
      { hand: "K7s", action: "CALL", weight: "mix" },
      { hand: "KTs", action: "JAM", weight: "mix" },
      { hand: "K5s", action: "FOLD", weight: "mix" },
      { hand: "A5s", action: "JAM", weight: "mix" },
    ],
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
    rangeTitle: "SB rejam pary",
    rangeSummary:
      "Stredni a nizsi pary pri 15-20 BB casto preferuji rejam pred callem mimo pozici.",
    rangeCells: [
      { hand: "66", action: "JAM", weight: "pure" },
      { hand: "44", action: "JAM", weight: "mix" },
      { hand: "22", action: "FOLD", weight: "mix" },
      { hand: "99", action: "JAM", weight: "pure" },
    ],
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
    rangeTitle: "BTN vs HJ open",
    rangeSummary:
      "KQo je silna, ale proti HJ range nechceme vzdy izolovat do top calling range all-inem.",
    rangeCells: [
      { hand: "KQo", action: "CALL", weight: "mix" },
      { hand: "AQo", action: "JAM", weight: "mix" },
      { hand: "KJo", action: "FOLD", weight: "mix" },
      { hand: "AJs", action: "JAM", weight: "mix" },
    ],
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
    rangeTitle: "BB 15 BB vs CO",
    rangeSummary:
      "Pri 15 BB je mnoho silnych broadway es prirozeny rejam proti late-position openum.",
    rangeCells: [
      { hand: "AJo", action: "JAM", weight: "pure" },
      { hand: "ATo", action: "JAM", weight: "mix" },
      { hand: "A9o", action: "CALL", weight: "mix" },
      { hand: "KQo", action: "JAM", weight: "mix" },
    ],
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
    rangeTitle: "SB rejam suited broadwaye",
    rangeSummary:
      "Suited broadwaye dobre funguji jako rejam proti sirokemu BTN open range, hlavne ze SB mimo pozici.",
    rangeCells: [
      { hand: "QTs", action: "JAM", weight: "mix" },
      { hand: "JTs", action: "JAM", weight: "mix" },
      { hand: "Q9s", action: "CALL", weight: "mix" },
      { hand: "KTs", action: "JAM", weight: "pure" },
    ],
    explanation:
      "QTs ma slusnou equity proti callum a blokuje cast pokracovaci range. Ze SB je rejam casto cistsi nez call mimo pozici.",
  }),
] as const satisfies readonly TrainingSpot[];
