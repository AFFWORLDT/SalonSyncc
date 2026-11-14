/**
 * The login page's photo, picked anew on every visit, with the colours of its moving background (taken from the
 * photo, darkest first) so both halves feel like one scene. Shown full screen behind the sign-in card.
 */
export interface LoginScene {
  src: string;
  alt: string;
  /** Mesh gradient colours sampled from the photo (darkest first); mesh[0] tints the mobile header's fade. */
  mesh: string[];
  /** object-position for the full-screen crop: keeps the mirror and chair in view behind the headline. */
  pos: string;
}

export const LOGIN_SCENES: LoginScene[] = [
  { src: "/login/salon-1.jpg", alt: "Salon chairs between glowing arched mirrors", mesh: ["#1f1912", "#4d3a26", "#9c7a4e", "#d8bf92", "#33261a"], pos: "50% 45%" },
  { src: "/login/salon-2.jpg", alt: "A bright salon with lit mirrors and black chairs", mesh: ["#1a1815", "#3d3730", "#8a7a5e", "#e2d6bd", "#2a2622"], pos: "40% 50%" },
  { src: "/login/salon-3.jpg", alt: "A dark wood salon with a round lit mirror", mesh: ["#100e0c", "#2e241c", "#6b4f38", "#b08a5c", "#221c17"], pos: "35% 55%" },
  { src: "/login/salon-5.jpg", alt: "Olive green chairs and copper wash stations", mesh: ["#141c16", "#2e3a2c", "#5f6b45", "#c08a5b", "#1f2a22"], pos: "45% 55%" },
  { src: "/login/salon-6.jpg", alt: "Gold arched mirrors and gold chairs on marble", mesh: ["#1c1610", "#5e4a2a", "#b38c4c", "#eadbb8", "#3a2d1c"], pos: "50% 50%" },
];

const LAST = "ss_login_scene";

/** A different scene from last time (when storage allows). */
export function pickScene(rand = Math.random): number {
  let last = -1;
  try {
    last = Number(localStorage.getItem(LAST) ?? -1);
  } catch {}
  let i = Math.floor(rand() * LOGIN_SCENES.length);
  if (LOGIN_SCENES.length > 1 && i === last) i = (i + 1) % LOGIN_SCENES.length;
  try {
    localStorage.setItem(LAST, String(i));
  } catch {}
  return i;
}
