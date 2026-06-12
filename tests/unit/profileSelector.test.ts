// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
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
    expect(variant).not.toBeNull();
    expect(format).not.toBeNull();
    expect(speed).not.toBeNull();

    variant!.value = "SNG";
    variant!.dispatchEvent(new Event("change"));
    format!.value = "SIX_MAX";
    speed!.value = "TURBO";

    expect(changes).toEqual(["SNG"]);
    expect(view.getProfile()).toMatchObject({
      gameVariant: "SNG",
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
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
    expect(note?.dataset.status).toBe("candidate");
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
    expect(note?.dataset.status).toBe("missing");
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
      expect(note?.textContent).toContain(`${value.toLowerCase()} postflop`);
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
    expect(note?.dataset.status).toBe("candidate");
    expect(note?.textContent).toContain("SNG chipEV preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent).not.toContain("RangePack");

    evModel!.value = "ICM";
    evModel!.dispatchEvent(new Event("change"));

    note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("candidate");
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

    evModel!.value = "DOLAR_EV";
    evModel!.dispatchEvent(new Event("change"));

    const note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(view.getProfile().evModel).toBe("DOLAR_EV");
    expect(note?.dataset.status).toBe("missing");
    expect(note?.textContent).toContain("MTT 9-max regular preflop $EV");
    expect(note?.textContent).toContain("missing production range");
    expect(note?.textContent).not.toContain("CHIP_EV");
    expect(note?.textContent).not.toContain("DOLAR_EV");
    expect(note?.textContent).not.toContain("RangePack");
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
    expect(rakeMode?.value).toBe("RAKE");
    expect(Array.from(rakeMode?.options ?? []).map((option) => option.textContent)).toEqual([
      "N/A",
      "Rake",
      "No rake",
    ]);
    expect(note?.dataset.status).toBe("candidate");
    expect(note?.textContent).toContain("Cash rake preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent?.toLowerCase()).not.toContain("zdroj");
    expect(note?.textContent).not.toContain("RangePack");

    rakeMode!.value = "NO_RAKE";
    rakeMode!.dispatchEvent(new Event("change"));

    note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("candidate");
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
