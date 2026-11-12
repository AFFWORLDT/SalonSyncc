import { button, emailLayout, esc } from "./layout";

/** "Confirm your subscription": the double opt-in email for the site newsletter. */
export function newsletterConfirmEmail(o: { brand: string; siteUrl: string; confirmUrl: string; unsubscribeUrl: string; lang: "en" | "ar" }): { subject: string; html: string; text: string } {
  const ar = o.lang === "ar";
  const subject = ar ? `أكّد اشتراكك في نشرة ${o.brand}` : `Confirm your ${o.brand} newsletter subscription`;
  const lead = ar
    ? `اضغط الزر لتأكيد اشتراكك. سنرسل لك نصائح لأصحاب الصالونات وأخبار ${o.brand}، ولن نشارك بريدك مع أي جهة.`
    : `Tap the button to confirm. We'll send tips for salon owners and ${o.brand} news, and we never share your email.`;
  const ignore = ar ? "لم تطلب ذلك؟ تجاهل هذه الرسالة ولن نرسل لك شيئًا." : "Didn't ask for this? Ignore this email and you won't hear from us.";
  const body = `
<div dir="${ar ? "rtl" : "ltr"}">
<h1 style="margin:0 0 8px 0;font-size:24px;line-height:30px">${ar ? "خطوة أخيرة" : "One last step"}</h1>
<p style="margin:0;font-size:15px;line-height:23px;color:#3d3a34">${esc(lead)}</p>
${button(o.confirmUrl, ar ? "تأكيد الاشتراك" : "Confirm subscription")}
<p style="margin:0;font-size:13px;line-height:20px;color:#67635b">${esc(ignore)}</p>
</div>`;
  const html = emailLayout({ brand: o.brand, siteUrl: o.siteUrl, preheader: lead, body, footer: `<a href="${esc(o.unsubscribeUrl)}" style="color:#67635b">${ar ? "إلغاء الاشتراك" : "Unsubscribe"}</a>` });
  const text = `${lead}\n\n${ar ? "تأكيد الاشتراك" : "Confirm"}: ${o.confirmUrl}\n\n${ignore}\n${ar ? "إلغاء الاشتراك" : "Unsubscribe"}: ${o.unsubscribeUrl}`;
  return { subject, html, text };
}
