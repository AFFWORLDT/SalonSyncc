import { HomePage } from "@/components/home/home-page";
import { HOME_AR } from "@/components/home/copy";

/** الصفحة الرئيسية بالعربية: نفس تصميم الصفحة الإنجليزية، من اليمين إلى اليسار. */
export default function ArabicHome() {
  return <HomePage t={HOME_AR} />;
}
