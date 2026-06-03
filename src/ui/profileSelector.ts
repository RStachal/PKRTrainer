import {
  DEFAULT_TRAINING_PROFILE,
  type BlindSpeed,
  type EvModel,
  type GameVariant,
  type RakeMode,
  type TableFormat,
  type TrainingProfile,
  type TrainingStreet,
} from "../core/trainingProfile";
import { cashCandidateImportReportForProfile } from "../data/ranges/cashPreflopRangePacks";
import { mttSixMaxCandidateImportReportForProfile } from "../data/ranges/mttPreflopRangePacks";
import { sngCandidateImportReportForProfile } from "../data/ranges/sngPreflopRangePacks";
import { rangePackForTrainingProfile } from "../data/ranges/trainingRangePacks";

export interface ProfileSelectorView {
  getProfile(): TrainingProfile;
  setProfile(profile: TrainingProfile): void;
  destroy(): void;
}

export interface ProfileSelectorCallbacks {
  onChange?: (profile: TrainingProfile) => void;
}

type ProfileStatus = "production" | "candidate" | "preview";

const GAME_VARIANTS: { value: GameVariant; label: string }[] = [
  { value: "MTT", label: "MTT" },
  { value: "SNG", label: "SNG" },
  { value: "CASH", label: "Cash game" },
];

const TABLE_FORMATS: { value: TableFormat; label: string }[] = [
  { value: "FULL_RING_9", label: "9-max full ring" },
  { value: "SIX_MAX", label: "6-max" },
];

const BLIND_SPEEDS: { value: BlindSpeed; label: string }[] = [
  { value: "REGULAR", label: "Regular" },
  { value: "TURBO", label: "Turbo" },
];

const STREETS: { value: TrainingStreet; label: string }[] = [
  { value: "PREFLOP", label: "Preflop" },
  { value: "FLOP", label: "Flop" },
  { value: "TURN", label: "Turn" },
  { value: "RIVER", label: "River" },
];

const EV_MODELS: { value: EvModel; label: string }[] = [
  { value: "CHIP_EV", label: "chipEV" },
  { value: "ICM", label: "ICM" },
];

const RAKE_MODES: { value: RakeMode; label: string }[] = [
  { value: "NONE", label: "N/A" },
  { value: "RAKE", label: "Rake" },
  { value: "NO_RAKE", label: "No rake" },
];

export function renderProfileSelector(
  root: HTMLElement,
  callbacks: ProfileSelectorCallbacks = {},
  initialProfile: TrainingProfile = DEFAULT_TRAINING_PROFILE,
): ProfileSelectorView {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const wrap = doc.createElement("section");
  wrap.className = "profile-selector";
  wrap.setAttribute("aria-label", "Profil tréninku");

  const title = doc.createElement("div");
  title.className = "profile-selector__title";
  title.textContent = "Profil tréninku";
  wrap.appendChild(title);

  const variant = selectControl(doc, "Varianta", "profile-variant", GAME_VARIANTS);
  const format = selectControl(doc, "Stůl", "profile-format", TABLE_FORMATS);
  const speed = selectControl(doc, "Blindy", "profile-speed", BLIND_SPEEDS);
  const street = selectControl(doc, "Street", "profile-street", STREETS);
  const evModel = selectControl(doc, "Model", "profile-ev-model", EV_MODELS);
  const rakeMode = selectControl(doc, "Rake", "profile-rake-mode", RAKE_MODES);

  for (const control of [variant, format, speed, street, evModel, rakeMode]) {
    wrap.appendChild(control.label);
    control.select.addEventListener("change", handleChange);
  }

  const note = doc.createElement("div");
  note.className = "profile-selector__note";
  note.style.overflowWrap = "anywhere";
  wrap.appendChild(note);

  root.appendChild(wrap);
  setProfile(initialProfile);

  function getProfile(): TrainingProfile {
    return {
      gameVariant: variant.select.value as GameVariant,
      tableFormat: format.select.value as TableFormat,
      blindSpeed: speed.select.value as BlindSpeed,
      street: street.select.value as TrainingStreet,
      evModel: evModel.select.value as EvModel,
      ante: variant.select.value === "CASH" ? "OFF" : initialProfile.ante,
      rakeMode: rakeMode.select.value as RakeMode,
    };
  }

  function setProfile(profile: TrainingProfile): void {
    variant.select.value = profile.gameVariant;
    format.select.value = profile.tableFormat;
    speed.select.value = profile.blindSpeed;
    street.select.value = profile.street;
    evModel.select.value = profile.evModel;
    rakeMode.select.value = profile.rakeMode;
    updateNote(profile);
  }

  function handleChange(): void {
    applyVariantDefaults();
    const profile = getProfile();
    updateNote(profile);
    callbacks.onChange?.(profile);
  }

  function applyVariantDefaults(): void {
    const selectedVariant = variant.select.value as GameVariant;
    if (selectedVariant === "CASH") {
      if (format.select.value !== "SIX_MAX") format.select.value = "SIX_MAX";
      if (rakeMode.select.value === "NONE") rakeMode.select.value = "RAKE";
      if (evModel.select.value === "ICM") evModel.select.value = "CHIP_EV";
      if (speed.select.value === "TURBO") speed.select.value = "REGULAR";
      if (street.select.value !== "PREFLOP") street.select.value = "PREFLOP";
      return;
    }

    if (rakeMode.select.value !== "NONE") rakeMode.select.value = "NONE";
  }

  function updateNote(profile: TrainingProfile): void {
    const status = describeProfileStatus(profile);
    note.dataset.status = status.status;
    note.className = `profile-selector__note profile-selector__note--${status.status}`;
    note.textContent = status.text;
  }

  return {
    getProfile,
    setProfile,
    destroy(): void {
      for (const control of [variant, format, speed, street, evModel, rakeMode]) {
        control.select.removeEventListener("change", handleChange);
      }
      root.innerHTML = "";
    },
  };
}

function describeProfileStatus(profile: TrainingProfile): {
  status: ProfileStatus;
  text: string;
} {
  if (isProductionPreflopProfile(profile)) {
    return {
      status: "production",
      text:
        "Produkčně zapojený profil: MTT 9-max regular preflop chipEV. Data a metadata jsou součástí offline bundlu.",
    };
  }

  if (profile.street === "FLOP") {
    return {
      status: "preview",
      text:
        "Preview profil: flop trénink běží nad heuristickým StrategyPackem s LOW confidence a zobrazí modelová metadata i předpoklady.",
    };
  }

  const pack = rangePackForTrainingProfile(profile);
  if (pack && (pack.confidence === "LOW" || pack.records.length === 0)) {
    const sixMaxReport = mttSixMaxCandidateImportReportForProfile(profile);
    const sngReport = sngCandidateImportReportForProfile(profile);
    const cashReport = cashCandidateImportReportForProfile(profile);
    const importPreview = sixMaxReport
      ? ` Import preview: ${sixMaxReport.sourceCount} metodickych vstupu, ${sixMaxReport.recordCount} records, ${sixMaxReport.totalExplicitHands} hand hodnot.`
      : sngReport
        ? ` SNG ${profile.evModel === "ICM" ? "ICM" : "chipEV"} preview: ${sngReport.recordCount} records, ${sngReport.sourceCount} metodickych vstupu${sngReport.icm ? `, payout ${sngReport.icm.payoutStructureId}` : ""}.`
        : cashReport
          ? ` Cash ${profile.rakeMode === "RAKE" ? "RAKE" : "NO_RAKE"} preview: ${cashReport.recordCount} records, ${cashReport.sourceCount} metodickych vstupu, rake mode ${profile.rakeMode}.`
          : "";
    return {
      status: "candidate",
      text:
        `Candidate/preview profil: ${pack.id} má LOW confidence nebo 0 records; ` +
        "nespouští produkční scoring, dokud neprojde import report a ověření hand-class hodnot." +
        importPreview,
    };
  }

  return {
    status: "preview",
    text:
      "Preview profil: tato kombinace zatím nemá produkčně ověřený RangePack pro scoring.",
  };
}

function isProductionPreflopProfile(profile: TrainingProfile): boolean {
  return (
    profile.gameVariant === "MTT" &&
    profile.tableFormat === "FULL_RING_9" &&
    profile.blindSpeed === "REGULAR" &&
    profile.street === "PREFLOP" &&
    profile.evModel === "CHIP_EV" &&
    profile.rakeMode === "NONE"
  );
}

function selectControl<T extends string>(
  doc: Document,
  labelText: string,
  className: string,
  options: { value: T; label: string }[],
): { label: HTMLLabelElement; select: HTMLSelectElement } {
  const label = doc.createElement("label");
  label.className = "profile-selector__field";

  const span = doc.createElement("span");
  span.textContent = labelText;
  label.appendChild(span);

  const select = doc.createElement("select");
  select.className = className;
  for (const optionDef of options) {
    const option = doc.createElement("option");
    option.value = optionDef.value;
    option.textContent = optionDef.label;
    select.appendChild(option);
  }
  label.appendChild(select);

  return { label, select };
}
