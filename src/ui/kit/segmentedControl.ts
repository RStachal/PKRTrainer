export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlConfig<T extends string> {
  /** Název skupiny pro čtečku obrazovky, například „Ulice“. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export interface SegmentedControl<T extends string> {
  element: HTMLDivElement;
  /** Nastaví volbu bez ohlášení změny, například po obnovení uloženého stavu. */
  setValue: (value: T) => void;
}

/**
 * Přepínač jedné volby z několika (skupina přepínacích tlačítek podle
 * WAI-ARIA). Nahrazuje rozbalovací pole tam, kde je voleb pár a hráč je má
 * vidět všechny najednou.
 *
 * Šipky přesouvají výběr i zaměření a na konci přetečou na začátek. Do
 * skupiny se tabulátorem vstupuje jen na zvolenou položku.
 */
export function segmentedControl<T extends string>(
  doc: Document,
  config: SegmentedControlConfig<T>,
): SegmentedControl<T> {
  const root = doc.createElement("div");
  root.className = "dx-seg";
  root.setAttribute("role", "radiogroup");
  root.setAttribute("aria-label", config.label);

  let current = config.value;

  const buttons = config.options.map((option, index) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "dx-seg__option";
    button.setAttribute("role", "radio");
    button.dataset.value = option.value;
    button.textContent = option.label;
    button.addEventListener("click", () => select(option.value, true));
    button.addEventListener("keydown", (event) => onKeyDown(event, index));
    root.appendChild(button);
    return button;
  });

  function render(): void {
    const known = config.options.some((option) => option.value === current);
    buttons.forEach((button, index) => {
      const checked = button.dataset.value === current;
      button.setAttribute("aria-checked", String(checked));
      // Neznámá hodnota nesmí skupinu vyřadit z tabulátoru.
      button.tabIndex = checked || (!known && index === 0) ? 0 : -1;
    });
  }

  function select(value: T, notify: boolean): void {
    if (value === current) return;
    current = value;
    render();
    if (notify) config.onChange(value);
  }

  function onKeyDown(event: KeyboardEvent, index: number): void {
    const last = buttons.length - 1;
    let target: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        target = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        target = index === 0 ? last : index - 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(config.options[target].value, true);
    buttons[target].focus();
  }

  render();
  return { element: root, setValue: (value) => select(value, false) };
}
