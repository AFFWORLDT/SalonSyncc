/**
 * The login page's photo, picked anew on every visit, with the colours of its moving background (taken from the
 * photo, darkest first) so both halves feel like one scene. Photos are cropped to the panel's 4:5 shape.
 */
export interface LoginScene {
  src: string;
  alt: string;
  /** Mesh gradient colours for the form side, sampled from the photo. */
  mesh: string[];
}

export const LOGIN_SCENES: LoginScene[] = [
  { src: "/login/salon-1.jpg", alt: "Salon chairs between glowing arched mirrors", mesh: ["#1f1912", "#4d3a26", "#9c7a4e", "#d8bf92", "#33261a"] },
  { src: "/login/salon-2.jpg", alt: "A bright salon with lit mirrors and black chairs", mesh: ["#1a1815", "#3d3730", "#8a7a5e", "#e2d6bd", "#2a2622"] },
  { src: "/login/salon-3.jpg", alt: "A dark wood salon with a round lit mirror", mesh: ["#100e0c", "#2e241c", "#6b4f38", "#b08a5c", "#221c17"] },
  { src: "/login/salon-4.jpg", alt: "A white marble salon under a round ceiling light", mesh: ["#1f1b16", "#5a4a36", "#a88f66", "#ece2cf", "#3a3024"] },
  { src: "/login/salon-5.jpg", alt: "Olive green chairs and copper wash stations", mesh: ["#141c16", "#2e3a2c", "#5f6b45", "#c08a5b", "#1f2a22"] },
  { src: "/login/salon-6.jpg", alt: "Gold arched mirrors and gold chairs on marble", mesh: ["#1c1610", "#5e4a2a", "#b38c4c", "#eadbb8", "#3a2d1c"] },
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
