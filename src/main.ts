// Bootstrap aplikace MTT Preflop Trainer.
// Placeholder vstupní bod (task 1.1). Plné propojení (migrace → init → UI)
// bude doplněno v tasku 20.1 dle designu.

function bootstrap(): void {
  const root = document.getElementById("app");
  if (!root) {
    return;
  }
  root.textContent = "MTT Preflop Trainer";
}

bootstrap();
