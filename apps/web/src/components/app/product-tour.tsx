"use client";

import { useCallback, useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "@/lib/auth-context";
import { tourKey, tourSteps, visibleSteps } from "@/lib/tour";

export const START_TOUR = "ss:start-tour";

/** Runs the walkthrough once per person per salon on first sign-in, and again whenever START_TOUR is dispatched. */
export function ProductTour() {
  const { me, isAdmin, readOnly } = useAuth();
  const slug = me?.org.slug;
  const uid = me?.user.id;

  const run = useCallback(() => {
    if (!me) return;
    const steps = visibleSteps(tourSteps({ salonName: me.settings.display_name, isAdmin }));
    if (steps.length < 2) return;
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: "#08110f",
      overlayOpacity: 0.62,
      stagePadding: 6,
      stageRadius: 12,
      popoverClass: "ss-tour",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Let's go",
      steps,
      onDestroyed: () => {
        try {
          localStorage.setItem(tourKey(me.org.slug, me.user.id), "1");
        } catch {}
      },
    });
    d.drive();
  }, [me, isAdmin]);

  useEffect(() => {
    if (!slug || uid === undefined || readOnly) return;
    let done = false;
    try {
      // ss_tour_off: automated browsers (e2e) never get the first-login tour.
      done = localStorage.getItem(tourKey(slug, uid)) === "1" || localStorage.getItem("ss_tour_off") === "1";
    } catch {}
    if (done) return;
    // Let the frame and dashboard paint first so every step has its element.
    const t = setTimeout(run, 900);
    return () => clearTimeout(t);
  }, [slug, uid, readOnly, run]);

  useEffect(() => {
    window.addEventListener(START_TOUR, run);
    return () => window.removeEventListener(START_TOUR, run);
  }, [run]);

  return null;
}
