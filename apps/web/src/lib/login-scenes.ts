/**
 * The login page's full-screen salon photo, picked anew on every visit (16:9, 1672px WebP). `pos` keeps the mirror
 * and chair in view when the photo is cropped (phone header); `flip` mirrors a photo whose subject would otherwise
 * sit behind the sign-in card.
 */
export interface LoginScene {
  src: string;
  alt: string;
  /** object-position for the crop. */
  pos: string;
  flip?: boolean;
}

export const LOGIN_SCENES: LoginScene[] = [
  { src: "/login/lux-1.webp", alt: "A barber chair before a glowing round mirror", pos: "55% 60%" },
  { src: "/login/lux-2.webp", alt: "A warm salon reception with a curved wood desk", pos: "40% 55%" },
  { src: "/login/lux-3.webp", alt: "A leather barber chair by a lit round mirror", pos: "55% 60%" },
  { src: "/login/lux-4.webp", alt: "Two leather hair-wash chairs under brass lamps", pos: "55% 60%" },
  { src: "/login/lux-5.webp", alt: "A row of salon chairs before arched gold mirrors", pos: "35% 60%" },
  { src: "/login/lux-6.webp", alt: "A styling chair before a large backlit round mirror", pos: "30% 55%", flip: true },
  { src: "/login/lux-7.webp", alt: "A styling chair by an arched mirror and product shelves", pos: "45% 60%", flip: true },
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
