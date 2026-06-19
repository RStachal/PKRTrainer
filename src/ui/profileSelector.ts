import {
  DEFAULT_TRAINING_PROFILE,
  evModelLabel,
  type BlindSpeed,
  type EvModel,
  type GameVariant,
  type RakeMode,
  type TableFormat,
  type TrainingProfile,
  type TrainingStreet,
} from "../core/trainingProfile";
import type { AnteMode } from "../core/types";
import { trainingCapabilityForProfile } from "../data/ranges/trainingCapability";

export interface ProfileSelectorView {
  getProfile(): TrainingProfile;
  setProfile(profile: TrainingProfile): void;
  destroy(): void;
}

export interface ProfileSelectorCallbacks {
  onChange?: (profile: TrainingProfile) => void;
}

type ProfileStatus = "production" | "preview" | "blocked" | "unsupported";

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
  { value: "DOLAR_EV", label: "$EV" },
  { value: "ICM", label: "ICM" },
];

const ANTE_MODES: { value: AnteMode; label: string }[] = [
  { value: "ON", label: "Ante on" },
  { value: "OFF", label: "No ante" },
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
  wrap.setAttribute("aria-label", "Training profile");

  const title = doc.createElement("div");
  title.className = "profile-selector__title";
  title.textContent = "Training profile";
  wrap.appendChild(title);

  const variant = selectControl(doc, "Variant", "profile-variant", GAME_VARIANTS);
  const format = selectControl(doc, "Table", "profile-format", TABLE_FORMATS);
  const speed = selectControl(doc, "Blind speed", "profile-speed", BLIND_SPEEDS);
  const street = selectControl(doc, "Street", "profile-street", STREETS);
  const evModel = selectControl(doc, "Model", "profile-ev-model", EV_MODELS);
  const ante = selectControl(doc, "Ante", "profile-ante", ANTE_MODES);
  const rakeMode = selectControl(doc, "Rake", "profile-rake-mode", RAKE_MODES);

  for (const control of [variant, format, speed, street, evModel, ante, rakeMode]) {
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
      ante: variant.select.value === "CASH" ? "OFF" : ante.select.value as AnteMode,
      rakeMode: rakeMode.select.value as RakeMode,
    };
  }

  function setProfile(profile: TrainingProfile): void {
    variant.select.value = profile.gameVariant;
    format.select.value = profile.tableFormat;
    speed.select.value = profile.blindSpeed;
    street.select.value = profile.street;
    evModel.select.value = profile.evModel;
    ante.select.value = profile.ante;
    rakeMode.select.value = profile.rakeMode;
    updateOptionAvailability(profile.gameVariant);
    updateNote(profile);
  }

  function handleChange(): void {
    applyVariantDefaults();
    const profile = getProfile();
    updateOptionAvailability(profile.gameVariant);
    updateNote(profile);
    callbacks.onChange?.(profile);
  }

  function applyVariantDefaults(): void {
    const selectedVariant = variant.select.value as GameVariant;
    if (selectedVariant === "CASH") {
      if (format.select.value !== "SIX_MAX") format.select.value = "SIX_MAX";
      if (rakeMode.select.value === "NONE") rakeMode.select.value = "RAKE";
      if (ante.select.value !== "OFF") ante.select.value = "OFF";
      if (evModel.select.value === "ICM") evModel.select.value = "CHIP_EV";
      if (speed.select.value === "TURBO") speed.select.value = "REGULAR";
      if (street.select.value !== "PREFLOP") street.select.value = "PREFLOP";
      return;
    }

    if (rakeMode.select.value !== "NONE") rakeMode.select.value = "NONE";
    if (selectedVariant === "MTT" && evModel.select.value === "ICM") {
      evModel.select.value = "CHIP_EV";
    }
    if (selectedVariant === "SNG") {
      if (evModel.select.value === "DOLAR_EV") evModel.select.value = "CHIP_EV";
      if (street.select.value !== "PREFLOP") street.select.value = "PREFLOP";
    }
  }

  function updateOptionAvailability(selectedVariant: GameVariant): void {
    setOptionDisabled(evModel.select, "ICM", selectedVariant !== "SNG");
    setOptionDisabled(evModel.select, "DOLAR_EV", selectedVariant !== "MTT");
    for (const value of ["FLOP", "TURN", "RIVER"]) {
      setOptionDisabled(street.select, value, selectedVariant !== "MTT");
    }
    setOptionDisabled(format.select, "FULL_RING_9", selectedVariant === "CASH");
    setOptionDisabled(speed.select, "TURBO", selectedVariant === "CASH");
    setOptionDisabled(ante.select, "ON", selectedVariant === "CASH");
    setOptionDisabled(rakeMode.select, "NONE", selectedVariant === "CASH");
    setOptionDisabled(rakeMode.select, "RAKE", selectedVariant !== "CASH");
    setOptionDisabled(rakeMode.select, "NO_RAKE", selectedVariant !== "CASH");
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
      for (const control of [variant, format, speed, street, evModel, ante, rakeMode]) {
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
  const capability = trainingCapabilityForProfile(profile);
  if (capability.status === "PRODUCTION") {
    return {
      status: "production",
      text: `Production: ${mttProfileLabel(profile)}. Training runs from the offline bundle.`,
    };
  }
  if (capability.status === "PREVIEW") {
    if (profile.gameVariant === "MTT") {
      return {
        status: "preview",
        text:
          `Preview: ${mttProfileLabel(profile)} postflop training opens a concrete ` +
          "spot, table and practical assumptions.",
      };
    }
    return {
      status: "preview",
      text:
        `${candidateProfileLabel(profile)}: candidate/preview. Production scoring is disabled ` +
        "until hand-class values are reviewed.",
    };
  }
  if (capability.status === "BLOCKED") {
    const readiness = capability.mttReadiness;
    const label = mttProfileLabel(profile);
    if (readiness?.status === "CANDIDATE") {
      return {
        status: "blocked",
        text:
          `${label}: candidate/preview. Production scoring is disabled until reviewed ` +
          "hand-class coverage is complete.",
      };
    }
    return {
      status: "blocked",
      text: `${label}: missing production range. Production scoring is disabled.`,
    };
  }
  return {
    status: "unsupported",
    text: `Unsupported profile: ${capability.reason}`,
  };
}

function candidateProfileLabel(profile: TrainingProfile): string {
  if (profile.gameVariant === "SNG") {
    return `SNG ${evModelLabel(profile.evModel)} preview`;
  }
  if (profile.gameVariant === "CASH") {
    return `Cash ${profile.rakeMode === "RAKE" ? "rake" : "no rake"} preview`;
  }
  return `${profile.gameVariant} ${tableFormatLabel(profile.tableFormat)} preflop ${evModelLabel(profile.evModel)} ${anteLabel(profile.ante)} preview`;
}

function tableFormatLabel(format: TableFormat): string {
  return format === "FULL_RING_9" ? "9-max" : "6-max";
}

function blindSpeedLabel(speed: BlindSpeed): string {
  return speed === "REGULAR" ? "regular" : "turbo";
}

function setOptionDisabled(
  select: HTMLSelectElement,
  value: string,
  disabled: boolean,
): void {
  const option = Array.from(select.options).find((item) => item.value === value);
  if (option) option.disabled = disabled;
}

function mttProfileLabel(profile: TrainingProfile): string {
  return `MTT ${tableFormatLabel(profile.tableFormat)} ${blindSpeedLabel(profile.blindSpeed)} ${profile.street.toLowerCase()} ${evModelLabel(profile.evModel)} ${anteLabel(profile.ante)}`;
}

function anteLabel(ante: AnteMode): string {
  return ante === "ON" ? "ante on" : "no ante";
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
