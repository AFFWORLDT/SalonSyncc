import { ROOT_DOMAIN } from "./brand";

/**
 * The salon a tenant host belongs to ("superbeard" on superbeard.salonstation.online), or null on workers.dev,
 * localhost or the root domain, where login must name the salon.
 */
export function salonFromHost(host: string, root = ROOT_DOMAIN): string | null {
  const h = host.toLowerCase().split(":")[0];
  const r = root.toLowerCase();
  if (!r || !h.endsWith(`.${r}`)) return null;
  const sub = h.slice(0, -(r.length + 1));
  return sub && !sub.includes(".") ? sub : null;
}
