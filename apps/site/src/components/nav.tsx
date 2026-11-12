import { SiteHeader } from "@/components/home/site-header";
import { HOME_EN } from "@/components/home/copy";

/** The site header on English pages (kept as SiteNav for the pages that use it). `dark` is no longer needed: the header suits every page. */
export function SiteNav(props: { dark?: boolean } = {}) {
  void props;
  return <SiteHeader t={{ lang: HOME_EN.lang, home: HOME_EN.home, nav: HOME_EN.nav }} />;
}
