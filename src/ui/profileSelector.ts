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
import { readyMttPostflopPilotsForProfile } from "../data/ranges/mttPostflopPilotCatalog";
import { trainingCapabilityForProfile } from "../data/ranges/trainingCapability";
import { CS } from "./cs";

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
  { value: "CASH", label: CS.profile.options.cash },
];

const TABLE_FORMATS: { value: TableFormat; label: string }[] = [
  { value: "FULL_RING_9", label: CS.profile.options.fullRing },
  { value: "SIX_MAX", label: CS.profile.options.sixMax },
];

const BLIND_SPEEDS: { value: BlindSpeed; label: string }[] = [
  { value: "REGULAR", label: CS.profile.options.regular },
  { value: "TURBO", label: CS.profile.options.turbo },
];

const STREETS: { value: TrainingStreet; label: string }[] = [
  { value: "PREFLOP", label: CS.profile.options.preflop },
  { value: "FLOP", label: CS.profile.options.flop },
  { value: "TURN", label: CS.profile.options.turn },
  { value: "RIVER", label: CS.profile.options.river },
];

const EV_MODELS: { value: EvModel; label: string }[] = [
  { value: "CHIP_EV", label: "chipEV" },
  { value: "DOLAR_EV", label: "$EV" },
  { value: "ICM", label: "ICM" },
];

const ANTE_MODES: { value: AnteMode; label: string }[] = [
  { value: "ON", label: CS.profile.options.anteOn },
  { value: "OFF", label: CS.profile.options.anteOff },
];

const RAKE_MODES: { value: RakeMode; label: string }[] = [
  { value: "NONE", label: "N/A" },
  { value: "RAKE", label: "Rake" },
  { value: "NO_RAKE", label: CS.profile.options.noRake },
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
  wrap.setAttribute("aria-label", CS.profile.title);

  const title = doc.createElement("div");
  title.className = "profile-selector__title";
  title.textContent = CS.profile.title;
  wrap.appendChild(title);

  const variant = selectControl(doc, CS.profile.fields.variant, "profile-variant", GAME_VARIANTS);
  const format = selectControl(doc, CS.profile.fields.table, "profile-format", TABLE_FORMATS);
  const speed = selectControl(doc, CS.profile.fields.blindSpeed, "profile-speed", BLIND_SPEEDS);
  const street = selectControl(doc, CS.profile.fields.street, "profile-street", STREETS);
  const evModel = selectControl(doc, CS.profile.fields.model, "profile-ev-model", EV_MODELS);
  const ante = selectControl(doc, CS.profile.fields.ante, "profile-ante", ANTE_MODES);
  const rakeMode = selectControl(doc, CS.profile.fields.rake, "profile-rake-mode", RAKE_MODES);

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
      text: `${CS.profile.production}: ${mttProfileLabel(profile)}. ${CS.profile.productionOffline}`,
    };
  }
  if (
    capability.status === "PREVIEW" &&
    profile.gameVariant === "MTT" &&
    profile.street === "PREFLOP"
  ) {
    return {
      status: "preview",
      text: `Náhled: ${mttProfileLabel(profile)}. ${CS.profile.mttPreflopPreview}`,
    };
  }
  if (capability.status === "PREVIEW") {
    if (profile.gameVariant === "MTT") {
      const pilots = readyMttPostflopPilotsForProfile(profile);
      const pilotNote = pilots.length > 0
        ? ` ${CS.profile.postflopPilotAvailable(pilots.length)}`
        : "";
      return {
        status: "preview",
        text: `Náhled: ${mttProfileLabel(profile)}. ${CS.profile.postflopPreview}${pilotNote}`,
      };
    }
    return {
      status: "preview",
      text: `${candidateProfileLabel(profile)}: ${CS.profile.candidatePreview}`,
    };
  }
  if (capability.status === "BLOCKED") {
    const readiness = capability.mttReadiness;
    const label = mttProfileLabel(profile);
    if (readiness?.status === "CANDIDATE") {
      return {
        status: "blocked",
        text: `${label}: ${CS.profile.candidateBlocked}`,
      };
    }
    return {
      status: "blocked",
      text: `${label}: ${CS.profile.missingRange}`,
    };
  }
  return {
    status: "unsupported",
    text: CS.profile.unsupported,
  };
}

function candidateProfileLabel(profile: TrainingProfile): string {
  if (profile.gameVariant === "SNG") {
    return `SNG ${evModelLabel(profile.evModel)} náhled`;
  }
  if (profile.gameVariant === "CASH") {
    return `Cash ${profile.rakeMode === "RAKE" ? "rake" : "bez rake"} náhled`;
  }
  return `${profile.gameVariant} ${tableFormatLabel(profile.tableFormat)} preflop ${evModelLabel(profile.evModel)} ${anteLabel(profile.ante)} náhled`;
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
  return `MTT ${tableFormatLabel(profile.tableFormat)} ${blindSpeedLabel(profile.blindSpeed)} ${streetLabel(profile.street)} ${evModelLabel(profile.evModel)} ${anteLabel(profile.ante)}`;
}

function anteLabel(ante: AnteMode): string {
  return ante === "ON" ? "ante zapnuto" : "bez ante";
}

function streetLabel(street: TrainingStreet): string {
  return STREETS.find((item) => item.value === street)?.label.toLowerCase() ?? street.toLowerCase();
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
