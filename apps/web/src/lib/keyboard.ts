/**
 * Keeps the UI usable while the on-screen keyboard is open.
 *
 * iOS Safari doesn't shrink the page for the keyboard, it slides over fixed elements (our bottom sheet
 * and dialogs). Android Chrome shrinks the page (viewport meta interactive-widget=resizes-content).
 * This writes CSS variables on <html> that the sheet and dialogs use:
 *   --vvh  visible height (px)          --vvt  visible top offset (px)
 *   --kb   height hidden by the keyboard at the bottom (px)
 * and sets html[data-kb="open"] while typing with the keyboard up (the tab bar hides then).
 * It also scrolls the focused field into the middle of what is still visible.
 */
export function watchKeyboard(): () => void {
  const vv = window.visualViewport;
  const html = document.documentElement;
  let baseline = window.innerHeight;
  let raf = 0;

  const editing = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes((el as HTMLInputElement).type);
  };

  const update = () => {
    raf = 0;
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    if (!editing() && window.innerHeight > baseline) baseline = window.innerHeight;
    const kb = Math.max(0, Math.round(window.innerHeight - h - top));
    html.style.setProperty("--vvh", `${Math.round(h)}px`);
    html.style.setProperty("--vvt", `${Math.round(top)}px`);
    html.style.setProperty("--kb", `${kb}px`);
    const open = editing() && (kb > 80 || window.innerHeight < baseline - 120);
    if (open) html.dataset.kb = "open";
    else delete html.dataset.kb;
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  const onFocus = (e: FocusEvent) => {
    schedule();
    const el = e.target as HTMLElement;
    if (!editing() || !matchMedia("(pointer: coarse)").matches) return;
    // Wait for the keyboard to finish sliding in, then centre the field in what is still visible.
    setTimeout(() => {
      update();
      if (document.activeElement === el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 320);
  };
  const onBlur = () => setTimeout(schedule, 50);

  vv?.addEventListener("resize", schedule);
  vv?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  update();
  return () => {
    vv?.removeEventListener("resize", schedule);
    vv?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    if (raf) cancelAnimationFrame(raf);
  };
}
