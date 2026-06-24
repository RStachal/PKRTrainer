import { describe, expect, it } from "vitest";

import {
  parseAdbDevices,
  summarizeAndroidDeviceAvailability,
} from "../../src/e2e/androidDeviceAvailability";

describe("Android device availability preflight", () => {
  it("parsuje ready emulator a fyzicke zarizeni z adb devices -l", () => {
    const devices = parseAdbDevices([
      "List of devices attached",
      "emulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:1",
      "R58M123456A device usb:1-2 product:demo model:SM_Test device:test transport_id:2",
      "",
    ].join("\n"));

    expect(devices).toEqual([
      {
        serial: "emulator-5554",
        state: "device",
        details: "product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:1",
      },
      {
        serial: "R58M123456A",
        state: "device",
        details: "usb:1-2 product:demo model:SM_Test device:test transport_id:2",
      },
    ]);

    const report = summarizeAndroidDeviceAvailability({
      adbPath: "adb",
      devices,
    });
    expect(report.valid).toBe(true);
    expect(report.status).toBe("READY");
    expect(report.readySerial).toBe("emulator-5554");
    expect(report.counts.ready).toBe(2);
    expect(report.blockers).toEqual([]);
    expect(report.followups.join("\n")).toContain("ready serial emulator-5554");
  });

  it("vraci reprodukovatelny blocker kdyz adb chybi", () => {
    const report = summarizeAndroidDeviceAvailability({ adbPath: null });

    expect(report.valid).toBe(false);
    expect(report.status).toBe("MISSING_ADB");
    expect(report.readySerial).toBeNull();
    expect(report.blockers.join("\n")).toContain("adb was not found");
    expect(report.followups.join("\n")).toContain("Install Android SDK platform-tools");
  });

  it("rozlisi prazdny seznam, unauthorized, offline a no-permissions device", () => {
    expect(summarizeAndroidDeviceAvailability({
      adbPath: "adb",
      devices: [],
    }).status).toBe("NO_DEVICE");

    expect(summarizeAndroidDeviceAvailability({
      adbPath: "adb",
      devices: parseAdbDevices("List of devices attached\nABC123 unauthorized usb:1-2\n"),
    }).status).toBe("UNAUTHORIZED_DEVICE");

    expect(summarizeAndroidDeviceAvailability({
      adbPath: "adb",
      devices: parseAdbDevices("List of devices attached\nemulator-5554 offline transport_id:1\n"),
    }).status).toBe("OFFLINE_DEVICE");

    const noPermissions = summarizeAndroidDeviceAvailability({
      adbPath: "adb",
      devices: parseAdbDevices("List of devices attached\n???????????? no permissions (udev rules)\n"),
    });
    expect(noPermissions.status).toBe("NO_READY_DEVICE");
    expect(noPermissions.counts.noPermissions).toBe(1);
  });
});
