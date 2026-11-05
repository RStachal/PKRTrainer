/**
 * Spal stroj během fáze? Ze systémového logu Windows, ne z hodin.
 *
 * ## Proč to cyklus potřebuje (od 21. 10. 2026)
 *
 * Fáze 1 ranního cyklu 21. 10. hlásila „3.2x dražší než obvykle ... nejspíš
 * stroj dělá něco vedle" a nejdražší rodinu za 111,6 min. Já jsem z toho
 * vyvodil hlad po haldě a opravil rozpočet pruhů - a měření týž den to
 * vyvrátilo: táž rodina nanečisto 137 s se 16 GB haldy a 128 s se 4 865 MB.
 * Pravda byla v systémovém logu: v 7:05:20 se změnil zdroj napájení (notebook
 * šel ze zásuvky), stroj přecházel do moderního úsporného režimu a od 7:45:56
 * do 8:58:24 spal. Rodina nebyla pomalá, cyklus stál - a čas fáze se přesto
 * zapsal do historie cen jako měření.
 *
 * Noční runner usnutí pozná (deska, která přetáhne vlastní strop, spala), cyklus
 * stropy nemá, takže se ptá logu: Kernel-Power 42 (usnutí), 506 (moderní
 * úsporný režim), 105 (změna napájení) a Kernel-General 1 (skok systémového
 * času; jeho `OldTime` a `NewTime` říkají, kolik se prospalo).
 */
import { execFileSync } from "node:child_process";

export interface MachineEvent {
  id: number;
  provider: string;
  oldTime?: string | null;
  newTime?: string | null;
}

export interface Interruptions {
  sleeps: number;
  standbys: number;
  powerChanges: number;
  /** Součet skoků systémového času nad minutu. */
  sleptMinutes: number;
}

const KERNEL_POWER = "Microsoft-Windows-Kernel-Power";
const KERNEL_GENERAL = "Microsoft-Windows-Kernel-General";

export function summarizeInterruptions(events: readonly MachineEvent[]): Interruptions {
  let sleptMinutes = 0;
  for (const event of events) {
    if (event.provider !== KERNEL_GENERAL || event.id !== 1) continue;
    if (!event.oldTime || !event.newTime) continue;
    const jump = (Date.parse(event.newTime) - Date.parse(event.oldTime)) / 60000;
    // Synchronizace hodin posouvá o zlomky sekundy; skok přes minutu je spánek.
    if (Number.isFinite(jump) && jump > 1) sleptMinutes += jump;
  }
  const count = (id: number) => events.filter((event) => event.provider === KERNEL_POWER && event.id === id).length;
  return {
    sleeps: count(42),
    standbys: count(506),
    powerChanges: count(105),
    sleptMinutes: Math.round(sleptMinutes * 10) / 10,
  };
}

/** Věta pro log, nebo `undefined`, když stroj celou dobu jel. */
export function describeInterruptions(found: Interruptions): string | undefined {
  const parts: string[] = [];
  if (found.sleeps > 0 || found.sleptMinutes > 0) {
    parts.push(`${found.sleeps}x usnul (prospal ${found.sleptMinutes.toFixed(0)} min)`);
  }
  if (found.standbys > 0) parts.push(`${found.standbys}x přešel do úsporného režimu`);
  if (found.powerChanges > 0) parts.push(`${found.powerChanges}x změnil napájení`);
  return parts.length === 0 ? undefined : `stroj během fáze ${parts.join(", ")}`;
}

const localStamp = (at: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T`
    + `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
};

/**
 * Přerušení mezi `from` a `to`, nebo `undefined` mimo Windows nebo když se log
 * přečíst nedá - tehdy se cena zapisuje jako dosud, nic se nehádá.
 */
export function machineInterruptions(from: Date, to: Date): Interruptions | undefined {
  if (process.platform !== "win32") return undefined;
  const script = [
    `$from = [datetime]::Parse('${localStamp(from)}')`,
    `$to = [datetime]::Parse('${localStamp(to)}')`,
    "$found = Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=$from; EndTime=$to; Id=42,506,105,1}"
      + " -ErrorAction SilentlyContinue | Where-Object { $_.ProviderName -in '" + KERNEL_POWER + "','" + KERNEL_GENERAL + "' }"
      + " | ForEach-Object { $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { $d[$n.Name] = $n.'#text' };"
      + " [pscustomobject]@{ id = $_.Id; provider = $_.ProviderName; oldTime = $d['OldTime']; newTime = $d['NewTime'] } }",
    "ConvertTo-Json -InputObject @($found) -Compress",
  ].join("; ");
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      timeout: 60_000,
    }).trim();
    const parsed = JSON.parse(out === "" ? "[]" : out) as MachineEvent[] | MachineEvent;
    return summarizeInterruptions(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return undefined;
  }
}
