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
    expect(note?.textContent).toContain("offline bundlu");
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

  it("oznaci 6-max MTT preflop jako candidate preview bez produkcni jistoty", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    expect(format).not.toBeNull();

    format!.value = "SIX_MAX";
    format!.dispatchEvent(new Event("change"));

    const note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("candidate");
    expect(note?.textContent).toContain("Candidate/preview profil");
    expect(note?.textContent).toContain("nespouští produkční scoring");
    expect(note?.textContent).toContain("Import preview:");
    expect(note?.textContent).toContain("0 records");
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

    evModel!.value = "ICM";
    evModel!.dispatchEvent(new Event("change"));

    note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("candidate");
    expect(note?.textContent).toContain("SNG ICM preview");
    expect(note?.textContent).toContain("payout");
    expect(note?.textContent).not.toContain("https://");
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
    expect(note?.dataset.status).toBe("candidate");
    expect(note?.textContent).toContain("Cash RAKE preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent?.toLowerCase()).not.toContain("zdroj");

    rakeMode!.value = "NO_RAKE";
    rakeMode!.dispatchEvent(new Event("change"));

    note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("candidate");
    expect(note?.textContent).toContain("Cash NO_RAKE preview");
    expect(note?.textContent).not.toContain("https://");
    expect(note?.textContent?.toLowerCase()).not.toContain("zdroj");
  });

  it("vykresli profilovy vyber z bundlu bez runtime fetch", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const root = document.createElement("div");
    renderProfileSelector(root);

    expect(root.textContent).toContain("Profil tréninku");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
