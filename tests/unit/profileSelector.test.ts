// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
import { renderProfileSelector } from "../../src/ui/profileSelector";

describe("profileSelector", () => {
  it("vykresli vychozi MTT 9-max regular preflop chipEV profil", () => {
    const root = document.createElement("div");
    const view = renderProfileSelector(root);

    expect(root.querySelector(".profile-selector")).not.toBeNull();
    expect(view.getProfile()).toEqual(DEFAULT_TRAINING_PROFILE);
    expect(root.querySelector<HTMLElement>(".profile-selector__note")?.textContent)
      .toContain("produkčně zapojený MTT 9-max preflop chipEV");
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
});
