/** Czech source strings used only for explanatory copy in CZ mode. */
const CZ_CATALOG = {
  app: {
    title: "PKR Trainer",
    subtitle: "Trenažér pokerových rozhodnutí pro turnajovou hru.",
    primarySections: "Hlavní sekce",
    tabs: {
      training: "Trénink",
      stats: "Statistiky",
      hh: "Import HH",
    },
    postflopTraining: "Postflop trénink",
    actionsTitle: "Vaše akce:",
  },
  profile: {
    title: "Tréninkový profil",
    fields: {
      variant: "Varianta",
      table: "Stůl",
      blindSpeed: "Rychlost blindů",
      street: "Street",
      model: "Model",
      ante: "Ante",
      rake: "Rake",
    },
    options: {
      cash: "Cash game",
      fullRing: "9-max full ring",
      sixMax: "6-max",
      regular: "Regular",
      turbo: "Turbo",
      preflop: "Preflop",
      flop: "Flop",
      turn: "Turn",
      river: "River",
      anteOn: "Ante zapnuto",
      anteOff: "Bez ante",
      noRake: "Bez rake",
    },
    production: "Produkční profil",
    mttChipEvCore: "MTT ChipEV Core",
    productionOffline: "Trénink používá ověřená data z offline balíčku.",
    postflopPreview:
      "Náhled postflop tréninku otevře konkrétní spot, stůl a praktické předpoklady.",
    postflopPilotAvailable: (count: number) =>
      `Dostupné scoped solver piloty: ${count}. Nejde o plnou produkční coverage.`,
    mttPreflopPreview:
      "Náhled preflop tréninku je hratelný z historických dat; produkční release gate zůstává vypnutý do dokončení importu.",
    mttSixMaxDerivedPreview:
      "Odvozený náhled: range jsou přeneseny z 9-max podle počtu hráčů, kteří ještě jednají (6-max UTG dědí po 9-max LJ). Nejsou měřené. Proti veřejným 6-max referencím sedí v raných pozicích uvnitř běžných pásem, na buttonu a SB jsou spíš těsnější; u SB se přitom běžně uváděné hodnoty rozcházejí o víc než 20 bodů. Produkční hodnocení je vypnuté do importu měřených 6-max chartů.",
    candidatePreview:
      "Kandidátní náhled. Produkční hodnocení je vypnuté do dokončení kontroly strategických hodnot.",
    candidateBlocked:
      "Kandidátní náhled. Produkční hodnocení je vypnuté do dokončení kontroly pokrytí hand.",
    missingRange: "Chybí produkční range. Produkční hodnocení je vypnuté.",
    unsupported: "Tato kombinace profilu není v aktuální verzi podporována.",
  },
  filters: {
    positions: "Pozice",
    stackDepths: "Hloubky stacku (BB)",
    actionContext: "Kontext akce",
    configuration: "Nastavení",
    all: "Vše",
    none: "Žádné",
    selectAll: (section: string) => `Vybrat vše: ${section}`,
    clearAll: (section: string) => `Zrušit výběr: ${section}`,
    opponent: "Soupeř:",
    opponentUnknown: "Neznámý (GTO)",
    opponentTightAggressive: "Reg / TAG — solidní",
    opponentTightPassive: "Rock / nit — těsný, pasivní",
    opponentLooseAggressive: "Maniak / gambler — široký, agresivní",
    opponentLoosePassive: "Fish / calling station — široký, pasivní",
    noneSelected: "nic nevybráno",
    allSelected: (total: number) => `vše (${total})`,
    someSelected: (picked: number, total: number) => `${picked} z ${total}`,
    ante: "Ante (big blind ante)",
    scoring: "Hodnocení:",
    lenient: "Tolerantní",
    strict: "Přísné",
    seed: "Seed:",
    random: "náhodný",
    start: "Spustit trénink",
    empty:
      "Vybrané filtry neodpovídají žádnému spotu. Upravte pozice, hloubky stacku nebo kontext akce.",
  },
  training: {
    streak: (n: number) => (n === 0 ? "Série 0" : `Série ${n}`),
    tallyEmpty: "zatím bez odpovědi",
    tally: (correct: number, total: number, best: number) =>
      `${correct}/${total} správně · nejlepší série ${best}`,
    shovePrice: (risk: string, pot: string, folds: string) =>
      `Riskujete ${risk} BB, abyste vyhráli ${pot} BB — shove se zaplatí sám při ${folds} foldů.`,
    rejamPrice: (risk: string, pot: string, folds: string) =>
      `Přeshoveváte za ${risk} BB do potu ${pot} BB (blindy + open) — shove se zaplatí sám při ${folds} foldů openera.`,
    limpJamPrice: (risk: string, pot: string, limpers: string, folds: string) =>
      `Shove za ${risk} BB do potu ${pot} BB (blindy + ${limpers} limp) — zaplatí se sám, když všichni složí v ${folds} případů.`,
    openPrice: (risk: string, pot: string, folds: string) =>
      `Otevíráte za ${risk} BB do potu ${pot} BB — samotný open se zaplatí, když všichni složí v ${folds} případů. Co získáte navíc, když vás někdo dohraje, závisí na postflopu.`,
    shoveFoldsEnough: (folds: string) =>
      `Tenhle soupeř folduje ${folds}, takže shove vydělává i bez dojetí do showdownu.`,
    shoveFoldsShort: (folds: string) =>
      `Tenhle soupeř folduje jen ${folds}, takže shove musí obstát až u showdownu.`,
    callPrice: (odds: string, equity: string) =>
      `Pot odds ${odds}:1 — call potřebuje ${equity} equity.`,
    opponentBasisMeasured: "Frekvence foldů je změřená (Little, sv. 2).",
    opponentBasisInterpolated: "Frekvence foldů je odhad mezi změřenými krajními body — pořadí sedí, číslo je orientační.",
    question: "Otázka",
    changeSituation: "Změnit situaci",
    referenceRangesUnavailable:
      "Referenční range nejsou dostupné. Obnovte aplikaci nebo před tréninkem spusťte release kontroly.",
    productionStrategyUnavailable: "Produkční strategii se nepodařilo načíst.",
    correct: "Správně.",
    incorrect: "Zatím ne.",
    equivalent: "Stejně dobrá akce.",
    acceptable: "Přijatelná akce s malou EV odchylkou.",
    recommended: "Doporučení",
    actionEv: {
      title: "Action EV",
      best: "Best",
      unavailable: "Tento kontrolovaný strategy pack zatím neobsahuje solverové EV pro všechny nabízené akce.",
      note: "EV je uvedeno v BB pro jednotlivé akce; frekvence strategie je samostatný údaj.",
    },
    explanationUnavailable: "Pro tento spot není dostupné vysvětlení.",
    saveWarning: "Výsledek se nepodařilo uložit. Statistiky mohou být neúplné.",
    nextSpot: "Další spot",
    profile: {
      candidate: "kandidátní náhled",
      disabledUntilCoverage:
        "Produkční trénink je vypnutý do dokončení kontroly pokrytí.",
      missingRange: "chybí produkční range",
      missingStrategy: "chybí produkční strategie",
      disabled: "Produkční trénink je vypnutý.",
      unsupported: "Nepodporovaný profil.",
    },
  },
  postflop: {
    street: "Street",
    seed: "Seed",
    situation: "Situace",
    initiative: "Máme iniciativu",
    facingBet: "Čelíme sázce",
    oopLead: "Bez iniciativy, hrajeme první",
    mode: "Režim",
    random: "náhodný",
    singleSpot: "Jeden spot",
    handLine: "Hand line",
    handLineNeedsAllStreets: "needs turn and river coverage",
    generate: "Vygenerovat spot",
    unavailable:
      "Pro tuto situaci není dostupná produkční strategie. Vyberte jiný profil nebo akci zopakujte po instalaci produkčních dat.",
    question: "Otázka",
    newSpot: "Nový spot",
    changeSituation: "Změnit situaci",
    folded: "fold",
    hero: "Hero",
    villain: "Soupeř",
    you: "Vy",
    aggressor: "Agresor",
    caller: "Caller",
    correct: "Správně.",
    incorrect: "Zatím ne.",
    equivalent: "Stejně dobrá akce.",
    acceptable: "Přijatelná akce s malou EV odchylkou.",
    recommended: "Doporučení",
    actionEv: {
      title: "Action EV",
      best: "Best",
      unavailable: "Tento kontrolovaný strategy pack zatím neobsahuje solverové EV pro všechny nabízené akce.",
      note: "EV je uvedeno v BB pro jednotlivé akce; frekvence strategie je samostatný údaj.",
    },
    next: (street: string) => `Další: ${street}`,
    lineComplete: (correct: number, total: number) =>
      `Hand line dokončena: ${correct}/${total} street.`,
    blocks: {
      value: "Value range",
      bluffs: "Bluffy",
      check: "Check range",
      model: "Model",
      plan: "Plán",
    },
    noCandidates: "Žádní přirození kandidáti",
    flopRange: "Flop range",
    yourAction: "Vaše akce",
    heroBucket: "Kategorie handy Hero",
    laneHighlight: (title: string) => `Zvýraznit část ${title.toLowerCase()} v matici`,
    sizing: {
      small: (bb: number) => `Malý bet ${bb} BB`,
      big: (bb: number) => `Velký bet ${bb} BB`,
      raise: (bb: number) => `Raise ${bb} BB`,
      allIn: (bb: number) => `All-in ${bb} BB`,
      recommendedAllIn: (bb: number) => `Doporučený all-in přibližně ${bb} BB`,
      recommendedSmall: (bb: number) => `Doporučený malý bet přibližně ${bb} BB`,
      recommendedBig: (bb: number) => `Doporučený velký bet přibližně ${bb} BB`,
      recommendedRaise: (bb: number) => `Doporučený raise přibližně ${bb} BB`,
      recommendedCall: "Doporučený call",
      recommendedFold: "Doporučený fold",
      recommendedCheck: "Doporučený check",
    },
  },
  dashboard: {
    successRate: "Úspěšnost: ",
    lifetimeAccuracy: "Celková úspěšnost",
    bestStreak: "Nejlepší série",
    leakFocus: "Prioritní slabina",
    weightedAccuracy: "Vážená úspěšnost",
    averageDecision: "Průměrné rozhodnutí",
    decisionTrend: "Vývoj rychlosti rozhodnutí",
    trainingFocus: "Tréninkové zaměření",
    nextStudyFocus: "Další studijní priorita",
    train: "Trénovat",
    trainFocus: "Trénovat zaměření",
    rangeAudit: "Kontrola range",
    ready: "Připraveno",
    confidenceWeightedKpi: "KPI vážené podle spolehlivosti",
    decisionTimeTrend: "Vývoj času rozhodnutí",
    pendingSample: "Čeká se na dostatečný vzorek",
    stable: "Stabilní",
    recentAccuracyTrend: "Vývoj nedávné úspěšnosti",
    qualifiedLeaks: "Nejslabší spoty s dostatečným vzorkem",
    preflopLeakCharts: "Přehled preflop slabin",
    profile: "Profil",
    allProfiles: "Všechny profily",
    exportJson: "Exportovat JSON",
    importJson: "Importovat JSON",
    resetProfile: "Resetovat vybraný profil",
    transferPlaceholder: "JSON pro export / import statistik",
  },
  system: {
    unexpectedStart:
      "Aplikaci se kvůli neočekávané chybě nepodařilo spustit. Obnovte stránku.",
    runtimeError:
      "Došlo k neočekávané chybě aplikace. Část funkcí nemusí fungovat správně.",
    asyncError:
      "Došlo k neočekávané chybě při asynchronní operaci. Část funkcí nemusí fungovat správně.",
    migrationFailed:
      "Převod dat z předchozí verze nebyl dokončen. Trénink začíná s prázdnými statistikami; původní data zůstala beze změny.",
    postflopRecordsSave:
      "Postflop záznamy se nepodařilo uložit. Export preflop statistik zůstal zachován.",
    postflopLinesSave:
      "Postflop line záznamy se nepodařilo uložit. Export preflop statistik zůstal zachován.",
    postflopAnswerSave: "Postflop odpověď se nepodařilo uložit do místního úložiště.",
    postflopLineSave: "Postflop hand line se nepodařilo uložit do místního úložiště.",
    storageTitle: "Úložiště není konzistentní",
    storageMessage:
      "V místním úložišti se nepodařilo vytvořit čistý platný stav. Trénink nelze spustit. Zkontrolujte oprávnění úložiště v prohlížeči a obnovte aplikaci.",
    errorTitle: "Došlo k chybě",
    offlineFailure:
      "Aplikaci se nepodařilo plně připravit pro offline provoz. Online režim funguje, ale offline režim nemusí být dostupný.",
  },
  hh: {
    title: "Import historie hand",
    hint:
      "Vložte hand history z PokerStars a spusťte analýzu. Podporován je odpovídající profil 6-max nebo 9-max a efektivní stack 5–150 BB.",
    inputLabel: "Text historie handy",
    inputPlaceholder: "Vložte historii handy…",
    analyze: "Analyzovat",
    analysisLabel: "Analýza importované handy",
    tablePlaceholder: "Stůl se zobrazí po importu kompatibilní historie handy.",
    unreadableTitle: "Nepodařilo se načíst pole:",
    incompatible:
      "Hand history je čitelná, ale neodpovídá zvolenému modelu tréninku (profil 6-max nebo 9-max a efektivní stack 5–150 BB). Spot nebyl vytvořen.",
    decisionAnalysis: "Analýza rozhodnutí",
    postflopUnavailable:
      "Pro tuto handu a zvolený profil není dostupná produkční postflop strategie.",
    productionStrategyUnavailable:
      "Produkční strategii pro HH analýzu se nepodařilo načíst.",
    parseError: "Hand history se nepodařilo zpracovat. Zkontrolujte nečitelná pole a formát vstupu.",
    unexpectedError: (message: string) => `Neočekávaná chyba při zpracování hand history: ${message}`,
    facts: {
      position: "Pozice",
      hand: "Karty",
      stack: "Stack",
      node: "Situace",
      yourAction: "Vaše akce",
      result: "Výsledek",
      recommended: "Doporučení",
      board: "Společné karty",
      pot: "Bank",
      texture: "Textura",
    },
    results: {
      accepted: "Přijato",
      review: "K procvičení",
      notScored: "Nehodnoceno",
      notMapped: "Nerozpoznáno",
    },
    fields: {
      position: "pozice",
      actions: "akce",
      stack: "stack",
      cards: "karty",
    },
  },
} as const;

type WidenCatalog<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => string
  : T extends string
    ? string
    : T extends object
      ? { readonly [Key in keyof T]: WidenCatalog<T[Key]> }
      : T;

export type UiCatalog = WidenCatalog<typeof CZ_CATALOG>;
export type AppLanguage = "EN" | "CZ";

export const APP_LANGUAGE_STORAGE_KEY = "pkrtrainer.ui.language.v1";

const EN_CATALOG: UiCatalog = {
  app: {
    title: "PKR Trainer",
    subtitle: "Poker decision trainer for tournament play.",
    primarySections: "Primary sections",
    tabs: {
      training: "Training",
      stats: "Stats",
      hh: "HH Import",
    },
    postflopTraining: "Postflop training",
    actionsTitle: "Your action:",
  },
  profile: {
    title: "Training profile",
    fields: {
      variant: "Variant",
      table: "Table",
      blindSpeed: "Blind speed",
      street: "Street",
      model: "Model",
      ante: "Ante",
      rake: "Rake",
    },
    options: {
      cash: "Cash game",
      fullRing: "9-max full ring",
      sixMax: "6-max",
      regular: "Regular",
      turbo: "Turbo",
      preflop: "Preflop",
      flop: "Flop",
      turn: "Turn",
      river: "River",
      anteOn: "Ante on",
      anteOff: "Ante off",
      noRake: "No rake",
    },
    production: "Production profile",
    mttChipEvCore: "MTT ChipEV Core",
    productionOffline: "Training uses reviewed data from the offline bundle.",
    postflopPreview: "The postflop preview opens a concrete spot, table, and practical assumptions.",
    postflopPilotAvailable: (count: number) =>
      `Scoped solver pilots available: ${count}. This is not full production coverage.`,
    mttPreflopPreview:
      "The preflop preview is playable from historical data; the production release gate remains disabled until import is complete.",
    mttSixMaxDerivedPreview:
      "Derived preview: ranges are carried across from 9-max by how many opponents are still to act (6-max UTG inherits the 9-max lojack). They are not measured. Against public 6-max references the early seats sit inside the usual bands while the button and small blind run tighter - and published figures for the small blind disagree with each other by more than 20 points. Production scoring stays off until measured 6-max charts are imported.",
    candidatePreview:
      "Candidate preview. Production scoring is disabled until strategy values are reviewed.",
    candidateBlocked:
      "Candidate preview. Production scoring is disabled until hand coverage is reviewed.",
    missingRange: "Production range is missing. Production scoring is disabled.",
    unsupported: "This profile combination is not supported in the current version.",
  },
  filters: {
    positions: "Positions",
    stackDepths: "Stack depths (BB)",
    actionContext: "Action context",
    configuration: "Configuration",
    all: "All",
    none: "None",
    selectAll: (section: string) => `Select all: ${section}`,
    clearAll: (section: string) => `Clear all: ${section}`,
    opponent: "Opponent:",
    opponentUnknown: "Unknown (GTO)",
    opponentTightAggressive: "Reg / TAG - solid",
    opponentTightPassive: "Rock / nit - tight, passive",
    opponentLooseAggressive: "Maniac / gambler - wide, aggressive",
    opponentLoosePassive: "Fish / calling station - wide, passive",
    noneSelected: "none selected",
    allSelected: (total: number) => `all (${total})`,
    someSelected: (picked: number, total: number) => `${picked} of ${total}`,
    ante: "Ante (big blind ante)",
    scoring: "Scoring:",
    lenient: "Lenient",
    strict: "Strict",
    seed: "Seed:",
    random: "random",
    start: "Start training",
    empty:
      "The selected filters do not match any spot. Adjust positions, stack depths, or the action context.",
  },
  training: {
    streak: (n: number) => (n === 0 ? "Streak 0" : `Streak ${n}`),
    tallyEmpty: "no answers yet",
    tally: (correct: number, total: number, best: number) =>
      `${correct}/${total} correct - best streak ${best}`,
    shovePrice: (risk: string, pot: string, folds: string) =>
      `You risk ${risk} BB to win ${pot} BB - the shove pays for itself at ${folds} folds.`,
    rejamPrice: (risk: string, pot: string, folds: string) =>
      `You shove ${risk} BB over the raise into ${pot} BB (blinds plus the open) - it pays for itself at ${folds} folds from the opener.`,
    limpJamPrice: (risk: string, pot: string, limpers: string, folds: string) =>
      `You shove ${risk} BB into ${pot} BB (blinds plus ${limpers} limp) - it pays for itself when everyone folds ${folds} of the time.`,
    openPrice: (risk: string, pot: string, folds: string) =>
      `You open for ${risk} BB into ${pot} BB - the raise alone pays for itself when everyone folds ${folds} of the time. What it wins beyond that when called depends on postflop play.`,
    shoveFoldsEnough: (folds: string) =>
      `This opponent folds ${folds}, so the shove profits without ever reaching showdown.`,
    shoveFoldsShort: (folds: string) =>
      `This opponent folds only ${folds}, so the shove has to hold up at showdown.`,
    callPrice: (odds: string, equity: string) =>
      `Pot odds ${odds}:1 - the call needs ${equity} equity.`,
    opponentBasisMeasured: "Fold frequency is measured (Little, vol. 2).",
    opponentBasisInterpolated: "Fold frequency is interpolated between the measured anchors - the ordering holds, the number is indicative.",
    question: "Question",
    changeSituation: "Change situation",
    referenceRangesUnavailable:
      "Reference ranges are unavailable. Reload the app or run the release checks before training.",
    productionStrategyUnavailable: "The production strategy could not be loaded.",
    correct: "Correct.",
    incorrect: "Not quite.",
    equivalent: "Equally good action.",
    acceptable: "Acceptable action with a small EV difference.",
    recommended: "Recommended",
    actionEv: {
      title: "Action EV",
      best: "Best",
      unavailable: "This reviewed strategy pack does not yet contain solver EV for every offered action.",
      note: "EV is shown in BB for each action; strategy frequency is a separate value.",
    },
    explanationUnavailable: "No explanation is available for this spot.",
    saveWarning: "The result could not be saved. Stats may be incomplete.",
    nextSpot: "Next spot",
    profile: {
      candidate: "candidate preview",
      disabledUntilCoverage: "Production training is disabled until coverage review is complete.",
      missingRange: "production range missing",
      missingStrategy: "production strategy missing",
      disabled: "Production training is disabled.",
      unsupported: "Unsupported profile.",
    },
  },
  postflop: {
    street: "Street",
    seed: "Seed",
    situation: "Situation",
    initiative: "We have initiative",
    facingBet: "Facing a bet",
    oopLead: "No initiative, first to act",
    mode: "Mode",
    random: "random",
    singleSpot: "Single spot",
    handLine: "Hand line",
    handLineNeedsAllStreets: "vyžaduje pokrytí turnu a riveru",
    generate: "Generate spot",
    unavailable:
      "No production strategy is available for this situation. Select another profile or retry after production data is installed.",
    question: "Question",
    newSpot: "New spot",
    changeSituation: "Change situation",
    folded: "folded",
    hero: "Hero",
    villain: "Villain",
    you: "You",
    aggressor: "Aggressor",
    caller: "Caller",
    correct: "Correct.",
    incorrect: "Not quite.",
    equivalent: "Equally good action.",
    acceptable: "Acceptable action with a small EV difference.",
    recommended: "Recommended",
    actionEv: {
      title: "Action EV",
      best: "Best",
      unavailable: "This reviewed strategy pack does not yet contain solver EV for every offered action.",
      note: "EV is shown in BB for each action; strategy frequency is a separate value.",
    },
    next: (street: string) => `Next: ${street}`,
    lineComplete: (correct: number, total: number) =>
      `Hand line complete: ${correct}/${total} streets.`,
    blocks: {
      value: "Value range",
      bluffs: "Bluffs",
      check: "Check range",
      model: "Model",
      plan: "Plan",
    },
    noCandidates: "No natural candidates",
    flopRange: "Flop range",
    yourAction: "Your action",
    heroBucket: "Hero hand bucket",
    laneHighlight: (title: string) => `Highlight the ${title.toLowerCase()} section in the matrix`,
    sizing: {
      small: (bb: number) => `Small bet ${bb} BB`,
      big: (bb: number) => `Big bet ${bb} BB`,
      raise: (bb: number) => `Raise ${bb} BB`,
      allIn: (bb: number) => `All-in ${bb} BB`,
      recommendedAllIn: (bb: number) => `Recommended all-in about ${bb} BB`,
      recommendedSmall: (bb: number) => `Recommended small bet about ${bb} BB`,
      recommendedBig: (bb: number) => `Recommended big bet about ${bb} BB`,
      recommendedRaise: (bb: number) => `Recommended raise about ${bb} BB`,
      recommendedCall: "Recommended call",
      recommendedFold: "Recommended fold",
      recommendedCheck: "Recommended check",
    },
  },
  dashboard: {
    successRate: "Success rate: ",
    lifetimeAccuracy: "Lifetime accuracy",
    bestStreak: "Best streak",
    leakFocus: "Priority leak",
    weightedAccuracy: "Weighted accuracy",
    averageDecision: "Average decision time",
    decisionTrend: "Decision speed trend",
    trainingFocus: "Training focus",
    nextStudyFocus: "Next study focus",
    train: "Train",
    trainFocus: "Train focus",
    rangeAudit: "Range audit",
    ready: "Ready",
    confidenceWeightedKpi: "Confidence-weighted KPI",
    decisionTimeTrend: "Decision time trend",
    pendingSample: "Waiting for a sufficient sample",
    stable: "Stable",
    recentAccuracyTrend: "Recent accuracy trend",
    qualifiedLeaks: "Weakest spots with a sufficient sample",
    preflopLeakCharts: "Preflop leak overview",
    profile: "Profile",
    allProfiles: "All profiles",
    exportJson: "Export JSON",
    importJson: "Import JSON",
    resetProfile: "Reset selected profile",
    transferPlaceholder: "Stats export / import JSON",
  },
  system: {
    unexpectedStart: "The app could not start because of an unexpected error. Reload the page.",
    runtimeError:
      "An unexpected application error occurred. Some features may not work correctly.",
    asyncError:
      "An unexpected error occurred during an asynchronous operation. Some features may not work correctly.",
    migrationFailed:
      "Data migration from the previous version did not complete. Training starts with empty stats; the original data remains unchanged.",
    postflopRecordsSave: "Postflop records could not be saved. The preflop stats export remains intact.",
    postflopLinesSave: "Postflop line records could not be saved. The preflop stats export remains intact.",
    postflopAnswerSave: "The postflop answer could not be saved to local storage.",
    postflopLineSave: "The postflop hand line could not be saved to local storage.",
    storageTitle: "Storage is inconsistent",
    storageMessage:
      "A clean valid state could not be created in local storage. Training cannot start. Check browser storage permissions and reload the app.",
    errorTitle: "An error occurred",
    offlineFailure:
      "The app could not be fully prepared for offline use. Online mode works, but offline mode may be unavailable.",
  },
  hh: {
    title: "Hand history import",
    hint:
      "Paste a PokerStars hand history and run analysis. Matching 6-max and 9-max profiles with effective stacks from 5 to 150 BB are supported.",
    inputLabel: "Hand history text",
    inputPlaceholder: "Paste hand history...",
    analyze: "Analyze",
    analysisLabel: "Imported hand analysis",
    tablePlaceholder: "The table appears after a compatible hand history is imported.",
    unreadableTitle: "Could not read fields:",
    incompatible:
      "The hand history is readable but does not match the selected training model (6-max or 9-max and an effective stack from 5 to 150 BB). No spot was created.",
    decisionAnalysis: "Decision analysis",
    postflopUnavailable: "No production postflop strategy is available for this hand and profile.",
    productionStrategyUnavailable: "The production strategy for HH analysis could not be loaded.",
    parseError: "The hand history could not be processed. Review the unreadable fields and input format.",
    unexpectedError: (message: string) => `Unexpected error while processing the hand history: ${message}`,
    facts: {
      position: "Position",
      hand: "Cards",
      stack: "Stack",
      node: "Situation",
      yourAction: "Your action",
      result: "Result",
      recommended: "Recommended",
      board: "Board",
      pot: "Pot",
      texture: "Texture",
    },
    results: {
      accepted: "Accepted",
      review: "Review",
      notScored: "Not scored",
      notMapped: "Not mapped",
    },
    fields: {
      position: "position",
      actions: "actions",
      stack: "stack",
      cards: "cards",
    },
  },
};

const CZECH_EXPLANATION_PREFIXES = [
  "app.subtitle",
  "profile.productionOffline",
  "profile.postflopPreview",
  "profile.postflopPilotAvailable",
  "profile.mttPreflopPreview",
  "profile.mttSixMaxDerivedPreview",
  "profile.candidatePreview",
  "profile.candidateBlocked",
  "profile.missingRange",
  "profile.unsupported",
  "filters.empty",
  "training.referenceRangesUnavailable",
  "training.productionStrategyUnavailable",
  "training.correct",
  "training.incorrect",
  "training.equivalent",
  "training.acceptable",
  "training.actionEv.unavailable",
  "training.actionEv.note",
  "training.explanationUnavailable",
  "training.saveWarning",
  "training.profile",
  "postflop.unavailable",
  "postflop.correct",
  "postflop.incorrect",
  "postflop.equivalent",
  "postflop.acceptable",
  "postflop.actionEv.unavailable",
  "postflop.actionEv.note",
  "system",
  "hh.hint",
  "hh.tablePlaceholder",
  "hh.unreadableTitle",
  "hh.incompatible",
  "hh.postflopUnavailable",
  "hh.productionStrategyUnavailable",
  "hh.parseError",
  "hh.unexpectedError",
] as const;

const CZ_HYBRID_CATALOG = mergeHybridCatalog(EN_CATALOG, CZ_CATALOG) as UiCatalog;
let activeLanguage: AppLanguage = "CZ";

/** Legacy name retained so existing UI modules read the active language live. */
export const CS = new Proxy(EN_CATALOG, {
  get(_target, property: keyof UiCatalog) {
    const catalog = activeLanguage === "EN" ? EN_CATALOG : CZ_HYBRID_CATALOG;
    return catalog[property];
  },
}) as UiCatalog;

export function getAppLanguage(): AppLanguage {
  return activeLanguage;
}

export function initializeAppLanguage(storage?: Pick<Storage, "getItem"> | null): AppLanguage {
  try {
    const stored = storage?.getItem(APP_LANGUAGE_STORAGE_KEY);
    activeLanguage = isAppLanguage(stored) ? stored : "CZ";
  } catch {
    activeLanguage = "CZ";
  }
  return activeLanguage;
}

export function setAppLanguage(
  language: AppLanguage,
  storage?: Pick<Storage, "setItem"> | null,
): void {
  activeLanguage = language;
  try {
    storage?.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The in-memory choice still applies when browser storage is unavailable.
  }
}

export function catalogForLanguage(language: AppLanguage): UiCatalog {
  return language === "EN" ? EN_CATALOG : CZ_HYBRID_CATALOG;
}

export function localizedText(english: string, czech: string): string {
  return activeLanguage === "EN" ? english : czech;
}

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "EN" || value === "CZ";
}

function mergeHybridCatalog(english: unknown, czech: unknown, path = ""): unknown {
  if (!isPlainCatalogObject(english) || !isPlainCatalogObject(czech)) {
    return shouldUseCzech(path) ? czech : english;
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(english)) {
    const childPath = path.length > 0 ? `${path}.${key}` : key;
    output[key] = mergeHybridCatalog(english[key], czech[key], childPath);
  }
  return output;
}

function shouldUseCzech(path: string): boolean {
  return CZECH_EXPLANATION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
}

function isPlainCatalogObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
