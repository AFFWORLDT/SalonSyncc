/**
 * Small vibrations on taps and results, so the phone "feels" the app.
 *
 * Android Chrome: navigator.vibrate with a short pattern per kind.
 * iPhone Safari has no vibrate(); since iOS 18 toggling a native `<input type="checkbox" switch>`
 * gives the system haptic tick, so we click a hidden one (one tick per pulse).
 * Desktop and older phones: nothing happens.
 */
export type Haptic = "tap" | "select" | "success" | "warning" | "error";

const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 10,
  select: 15,
  success: [18, 60, 28],
  warning: [30, 50, 30],
  error: [40, 60, 40, 60, 40],
};
const IOS_PULSES: Record<Haptic, number> = { tap: 1, select: 1, success: 2, warning: 2, error: 3 };

let iosSwitch: HTMLLabelElement | null = null;

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

export function haptic(kind: Haptic = "tap") {
  if (typeof window === "undefined" || !matchMedia("(pointer: coarse)").matches) return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[kind]);
      return;
    }
    if (/iP(hone|ad|od)/.test(navigator.userAgent)) {
      for (let i = 0; i < IOS_PULSES[kind]; i++) setTimeout(iosTick, i * 90);
    }
  } catch {
    // Haptics are a nicety; never let them break a tap.
  }
}
