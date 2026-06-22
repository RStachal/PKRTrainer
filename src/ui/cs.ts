/** Centralni katalog viditelnych ceskych textu. */
export const CS = {
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
  hh: {
    title: "Import hand history",
    hint:
      "Vložte hand history z PokerStars a spusťte analýzu. Podporován je odpovídající profil 6-max nebo 9-max a efektivní stack 5–150 BB.",
    inputLabel: "Text hand history",
    inputPlaceholder: "Vložte hand history…",
    analyze: "Analyzovat",
    analysisLabel: "Analýza importované handy",
    tablePlaceholder: "Stůl se zobrazí po importu kompatibilní hand history.",
    unreadableTitle: "Nepodařilo se načíst pole:",
    incompatible:
      "Hand history je čitelná, ale neodpovídá zvolenému modelu tréninku (profil 6-max nebo 9-max a efektivní stack 5–150 BB). Spot nebyl vytvořen.",
    decisionAnalysis: "Analýza rozhodnutí",
    postflopUnavailable:
      "Pro tuto handu a zvolený profil není dostupná produkční postflop strategie.",
    facts: {
      position: "Pozice",
      hand: "Karty",
      stack: "Stack",
      node: "Situace",
      yourAction: "Vaše akce",
      result: "Výsledek",
      recommended: "Doporučení",
      board: "Board",
      pot: "Pot",
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
