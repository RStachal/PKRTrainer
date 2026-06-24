export type AndroidDeviceState =
  | "device"
  | "offline"
  | "unauthorized"
  | "no permissions"
  | "unknown";

export type AndroidDevicePreflightStatus =
  | "READY"
  | "MISSING_ADB"
  | "ADB_FAILED"
  | "NO_DEVICE"
  | "UNAUTHORIZED_DEVICE"
  | "OFFLINE_DEVICE"
  | "NO_READY_DEVICE";

export interface AndroidDeviceInfo {
  serial: string;
  state: AndroidDeviceState;
  details: string;
}

export interface AndroidDevicePreflightInput {
  adbPath: string | null;
  adbError?: string;
  devices?: readonly AndroidDeviceInfo[];
}

export interface AndroidDevicePreflightReport {
  valid: boolean;
  status: AndroidDevicePreflightStatus;
  adbPath: string | null;
  counts: {
    devices: number;
    ready: number;
    unauthorized: number;
    offline: number;
    noPermissions: number;
    other: number;
  };
  devices: readonly AndroidDeviceInfo[];
  blockers: readonly string[];
  followups: readonly string[];
}

export function parseAdbDevices(output: string): AndroidDeviceInfo[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.toLowerCase().startsWith("list of devices"))
    .map(parseAdbDeviceLine)
    .filter((device): device is AndroidDeviceInfo => device !== null);
}

export function summarizeAndroidDeviceAvailability(
  input: AndroidDevicePreflightInput,
): AndroidDevicePreflightReport {
  const devices = input.devices ?? [];
  const counts = countDevices(devices);

  if (!input.adbPath) {
    return buildReport(input.adbPath, "MISSING_ADB", counts, devices, [
      "Android device/WebView acceptance cannot run because adb was not found.",
      "This is an environment blocker, not an application pass/fail result.",
    ], [
      "Install Android SDK platform-tools or set ADB_PATH to adb.",
      "Start an Android emulator or connect a WebView-capable Android device.",
      "Run npm run e2e:android:preflight before the device E2E flow.",
    ]);
  }

  if (input.adbError) {
    return buildReport(input.adbPath, "ADB_FAILED", counts, devices, [
      `adb devices -l failed: ${input.adbError}`,
      "Android device/WebView acceptance cannot run until adb is callable.",
    ], [
      "Check that the adb binary is executable and Android platform-tools are healthy.",
      "Run adb kill-server && adb start-server, then retry npm run e2e:android:preflight.",
    ]);
  }

  if (counts.ready > 0) {
    return buildReport(input.adbPath, "READY", counts, devices, [], [
      "Run the Android WebView/device E2E flow against a ready serial.",
      "Capture screenshots, logcat and offline reload evidence for 135.38.",
    ]);
  }

  if (devices.length === 0) {
    return buildReport(input.adbPath, "NO_DEVICE", counts, devices, [
      "adb is available, but no Android emulator/device is listed.",
    ], [
      "Start an Android emulator or connect a physical Android device with USB debugging enabled.",
      "Confirm adb devices -l shows at least one device in state 'device'.",
    ]);
  }

  if (counts.unauthorized > 0) {
    return buildReport(input.adbPath, "UNAUTHORIZED_DEVICE", counts, devices, [
      "Android device/WebView acceptance cannot run because every listed device is unauthorized or otherwise not ready.",
    ], [
      "Confirm the USB debugging authorization prompt on the device.",
      "Reconnect the device or restart adb, then rerun npm run e2e:android:preflight.",
    ]);
  }

  if (counts.offline > 0) {
    return buildReport(input.adbPath, "OFFLINE_DEVICE", counts, devices, [
      "Android device/WebView acceptance cannot run because every listed device is offline or otherwise not ready.",
    ], [
      "Restart the emulator/device and adb server.",
      "Confirm adb devices -l shows at least one device in state 'device'.",
    ]);
  }

  return buildReport(input.adbPath, "NO_READY_DEVICE", counts, devices, [
    "adb is available, but no listed Android target is ready for WebView/device E2E.",
  ], [
    "Resolve the listed adb device states until one target reports state 'device'.",
  ]);
}

function parseAdbDeviceLine(line: string): AndroidDeviceInfo | null {
  const [serial, stateToken, ...rest] = line.split(/\s+/);
  if (!serial || !stateToken) return null;

  return {
    serial,
    state: normalizeState(stateToken, rest.join(" ")),
    details: rest.join(" "),
  };
}

function normalizeState(stateToken: string, details: string): AndroidDeviceState {
  const normalized = stateToken.toLowerCase();
  if (normalized === "device" || normalized === "offline" || normalized === "unauthorized") {
    return normalized;
  }
  if (normalized === "no" && details.toLowerCase().startsWith("permissions")) {
    return "no permissions";
  }
  return "unknown";
}

function countDevices(devices: readonly AndroidDeviceInfo[]): AndroidDevicePreflightReport["counts"] {
  let ready = 0;
  let unauthorized = 0;
  let offline = 0;
  let noPermissions = 0;
  let other = 0;

  for (const device of devices) {
    if (device.state === "device") ready += 1;
    else if (device.state === "unauthorized") unauthorized += 1;
    else if (device.state === "offline") offline += 1;
    else if (device.state === "no permissions") noPermissions += 1;
    else other += 1;
  }

  return {
    devices: devices.length,
    ready,
    unauthorized,
    offline,
    noPermissions,
    other,
  };
}

function buildReport(
  adbPath: string | null,
  status: AndroidDevicePreflightStatus,
  counts: AndroidDevicePreflightReport["counts"],
  devices: readonly AndroidDeviceInfo[],
  blockers: readonly string[],
  followups: readonly string[],
): AndroidDevicePreflightReport {
  return {
    valid: status === "READY",
    status,
    adbPath,
    counts,
    devices,
    blockers,
    followups,
  };
}
