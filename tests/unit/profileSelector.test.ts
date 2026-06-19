// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TRAINING_PROFILE,
  profileWith,
  type BlindSpeed,
  type EvModel,
  type TableFormat,
  type TrainingStreet,
} from "../../src/core/trainingProfile";
import type { AnteMode } from "../../src/core/types";
import { renderProfileSelector } from "../../src/ui/profileSelector";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profileSelector", () => {
  it("vykresli vychozi MTT 9-max regular preflop chipEV profil", () => {
    const root = document.createElement("div");
    const view = renderProfileSelector(root);
    const note = root.querySelector<HTMLElement>(".profile-selector__note");

    expect(root.querySelector(".profile-selector")).not.toBeNull();
    expect(view.getProfile()).toEqual(DEFAULT_TRAINING_PROFILE);
    expect(note?.dataset.status).toBe("production");
    expect(note?.textContent).toContain("MTT 9-max regular preflop chipEV");
    expect(note?.textContent).toContain("offline bundle");
  });

  it("umi zmenit profil a zavola onChange", () => {
    const root = document.createElement("div");
    const changes: string[] = [];
    const view = renderProfileSelector(root, {
      onChange: (profile) => changes.push(profile.gameVariant),
    });

    const variant = root.querySelector<HTMLSelectElement>(".profile-variant");
    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    const speed = root.querySelector<HTMLSelectElement>(".profile-speed");
    const ante = root.querySelector<HTMLSelectElement>(".profile-ante");
    expect(variant).not.toBeNull();
    expect(format).not.toBeNull();
    expect(speed).not.toBeNull();
    expect(ante).not.toBeNull();

    variant!.value = "SNG";
    variant!.dispatchEvent(new Event("change"));
    expect(root.querySelector<HTMLOptionElement>('.profile-street option[value="FLOP"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLOptionElement>('.profile-ev-model option[value="DOLAR_EV"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLOptionElement>('.profile-ev-model option[value="ICM"]')?.disabled).toBe(false);
    format!.value = "SIX_MAX";
    speed!.value = "TURBO";
    ante!.value = "OFF";

    expect(changes).toEqual(["SNG"]);
    expect(view.getProfile()).toMatchObject({
      gameVariant: "SNG",
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
      ante: "OFF",
    });
  });

  it("oznaci 6-max MTT preflop jako candidate preview bez internich citaci", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    expect(format).not.toBeNull();

    format!.value = "SIX_MAX";
    format!.dispatchEvent(new Event("change"));

    const note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("blocked");
    expect(note?.textContent).toContain("MTT 6-max regular preflop chipEV");
    expect(note?.textContent).toContain("candidate/preview");
    expect(note?.textContent).toContain("hand-class coverage is complete");
    expect(note?.textContent).not.toContain("RangePack");
    expect(note?.textContent).not.toContain("mtt-");
  });

  it("oznaci MTT 9-max turbo preflop jako missing readiness stav", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const speed = root.querySelector<HTMLSelectElement>(".profile-speed");
    expect(speed).not.toBeNull();

    speed!.value = "TURBO";
    speed!.dispatchEvent(new Event("change"));

    const note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("blocked");
    expect(note?.textContent).toContain("MTT 9-max turbo preflop chipEV");
    expect(note?.textContent).toContain("missing production range");
    expect(note?.textContent).not.toContain("RangePack");
    expect(note?.textContent).not.toContain("mtt-");
  });

  it("po prepnuti na postflop street zobrazi preview status misto preflop produkcniho textu", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const street = root.querySelector<HTMLSelectElement>(".profile-street");

    for (const value of ["FLOP", "TURN", "RIVER"]) {
      street!.value = value;
      street!.dispatchEvent(new Event("change"));

      const note = root.querySelector<HTMLElement>(".profile-selector__note");
      expect(note?.dataset.status).toBe("preview");
      expect(note?.textContent).toContain(`MTT 9-max regular ${value.toLowerCase()} chipEV ante on`);
      expect(note?.textContent).toContain("postflop training");
      expect(note?.textContent).toContain("concrete spot");
      expect(note?.textContent).not.toContain("preflop chipEV");
      expect(note?.textContent).not.toContain("StrategyPack");
    }
  });

  it("rozlisi SNG chipEV preview a SNG ICM preview", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const variant = root.querySelector<HTMLSelectElement>(".profile-variant");
    const evModel = root.querySelector<HTMLSelectElement>(".profile-ev-model");
    variant!.value = "SNG";
    variant!.dispatchEvent(new Event("change"));

    let note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("preview");
    expect(note?.textContent).toContain("SNG chipEV preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent).not.toContain("RangePack");

    evModel!.value = "ICM";
    evModel!.dispatchEvent(new Event("change"));

    note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("preview");
    expect(note?.textContent).toContain("SNG ICM preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent).not.toContain("payout");
    expect(note?.textContent).not.toContain("RangePack");
  });

  it("nabidne DOLAR_EV jako samostatny $EV model bez spusteni chipEV produkce", () => {
    const root = document.createElement("div");
    const view = renderProfileSelector(root);

    const evModel = root.querySelector<HTMLSelectElement>(".profile-ev-model");
    expect(Array.from(evModel?.options ?? []).map((option) => ({
      value: option.value,
      label: option.textContent,
    }))).toEqual([
      { value: "CHIP_EV", label: "chipEV" },
      { value: "DOLAR_EV", label: "$EV" },
      { value: "ICM", label: "ICM" },
    ]);
    expect(evModel?.querySelector<HTMLOptionElement>('option[value="ICM"]')?.disabled).toBe(true);

    evModel!.value = "DOLAR_EV";
    evModel!.dispatchEvent(new Event("change"));

    const note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(view.getProfile().evModel).toBe("DOLAR_EV");
    expect(note?.dataset.status).toBe("blocked");
    expect(note?.textContent).toContain("MTT 9-max regular preflop $EV");
    expect(note?.textContent).toContain("missing production range");
    expect(note?.textContent).not.toContain("CHIP_EV");
    expect(note?.textContent).not.toContain("DOLAR_EV");
    expect(note?.textContent).not.toContain("RangePack");
  });

  it("pokryje vsechny MTT profilove dimenze source-free labely", () => {
    const tableFormats: TableFormat[] = ["FULL_RING_9", "SIX_MAX"];
    const blindSpeeds: BlindSpeed[] = ["REGULAR", "TURBO"];
    const streets: TrainingStreet[] = ["PREFLOP", "FLOP", "TURN", "RIVER"];
    const evModels: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">[] = ["CHIP_EV", "DOLAR_EV"];
    const antes: AnteMode[] = ["ON", "OFF"];
    const root = document.createElement("div");
    const view = renderProfileSelector(root);

    const optionLabels = (selector: string) => Array.from(
      root.querySelector<HTMLSelectElement>(selector)?.options ?? [],
    ).map((option) => option.textContent);
    expect(optionLabels(".profile-format")).toEqual(["9-max full ring", "6-max"]);
    expect(optionLabels(".profile-speed")).toEqual(["Regular", "Turbo"]);
    expect(optionLabels(".profile-street")).toEqual(["Preflop", "Flop", "Turn", "River"]);
    expect(optionLabels(".profile-ev-model")).toEqual(["chipEV", "$EV", "ICM"]);
    expect(optionLabels(".profile-ante")).toEqual(["Ante on", "No ante"]);

    for (const tableFormat of tableFormats) {
      for (const blindSpeed of blindSpeeds) {
        for (const street of streets) {
          for (const evModel of evModels) {
            for (const ante of antes) {
              view.setProfile(profileWith(DEFAULT_TRAINING_PROFILE, {
                tableFormat,
                blindSpeed,
                street,
                evModel,
                ante,
              }));
              const note = root.querySelector<HTMLElement>(".profile-selector__note");
              expect(view.getProfile()).toMatchObject({
                gameVariant: "MTT",
                tableFormat,
                blindSpeed,
                street,
                evModel,
                ante,
              });
              expect(note?.textContent).toContain(tableFormat === "FULL_RING_9" ? "9-max" : "6-max");
              expect(note?.textContent).toContain(blindSpeed === "REGULAR" ? "regular" : "turbo");
              expect(note?.textContent).toContain(street.toLowerCase());
              expect(note?.textContent).toContain(evModel === "CHIP_EV" ? "chipEV" : "$EV");
              expect(note?.textContent).toContain(ante === "ON" ? "ante on" : "no ante");
              expect(note?.textContent).not.toMatch(/\b(?:FULL_RING_9|SIX_MAX|REGULAR|TURBO|PREFLOP|FLOP|TURN|RIVER|CHIP_EV|DOLAR_EV)\b/);
              expect(note?.textContent).not.toMatch(/\b(?:RangePack|StrategyPack)\b/);
              expect(note?.textContent).not.toMatch(/\bmtt-[a-z0-9-]+/i);
              expect(note?.textContent).not.toMatch(/\bhttps?:\/\//i);
            }
          }
        }
      }
    }
  });

  it("rozlisi Cash rake/no-rake preview bez citaci zdroju v UI", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const variant = root.querySelector<HTMLSelectElement>(".profile-variant");
    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    const rakeMode = root.querySelector<HTMLSelectElement>(".profile-rake-mode");
    variant!.value = "CASH";
    variant!.dispatchEvent(new Event("change"));

    let note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(format?.value).toBe("SIX_MAX");
    expect(root.querySelector<HTMLSelectElement>(".profile-ante")?.value).toBe("OFF");
    expect(rakeMode?.value).toBe("RAKE");
    expect(format?.querySelector<HTMLOptionElement>('option[value="FULL_RING_9"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLOptionElement>('.profile-speed option[value="TURBO"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLOptionElement>('.profile-street option[value="FLOP"]')?.disabled).toBe(true);
    expect(Array.from(rakeMode?.options ?? []).map((option) => option.textContent)).toEqual([
      "N/A",
      "Rake",
      "No rake",
    ]);
    expect(note?.dataset.status).toBe("preview");
    expect(note?.textContent).toContain("Cash rake preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent?.toLowerCase()).not.toContain("zdroj");
    expect(note?.textContent).not.toContain("RangePack");

    rakeMode!.value = "NO_RAKE";
    rakeMode!.dispatchEvent(new Event("change"));

    note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("preview");
    expect(note?.textContent).toContain("Cash no rake preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent?.toLowerCase()).not.toContain("zdroj");
    expect(note?.textContent).not.toContain("RangePack");
  });

  it("vykresli profilovy vyber z bundlu bez runtime fetch", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const root = document.createElement("div");
    renderProfileSelector(root);

    expect(root.textContent).toContain("Training profile");
    expect(root.textContent).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
