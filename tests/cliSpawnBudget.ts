/**
 * How long a spawned CLI is allowed to take before a test calls it hung.
 *
 * These tests shell out to `npm run <script>`, which on Windows means starting
 * cmd, then npm, then vite-node, then compiling the script - tens of seconds
 * before the CLI under test does anything at all. The budgets were 30 and 60
 * seconds, which is roughly what that costs on an idle machine, so the tests
 * passed alone and failed whenever anything else was running. They took the
 * release packaging down three times: `status` comes back null, meaning killed
 * by signal, and the assertion reads `expected null to be 0` - which looks like
 * the CLI returned the wrong code rather than never having finished.
 *
 * This machine runs solver and MTT tasks on ten and fifteen minute triggers, so
 * "anything else running" is the normal case during a twenty-minute suite, not
 * an unlucky one.
 *
 * Five minutes is far more than the work needs and still catches a real hang in
 * a reasonable time. The point of the timeout is to fail a deadlock, not to
 * assert performance - nothing here measures speed, so a generous budget costs
 * nothing when the CLI behaves.
 */
export const CLI_SPAWN_TIMEOUT_MS = 300_000;
