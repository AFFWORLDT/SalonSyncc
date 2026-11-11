import { button, emailLayout, esc } from "./layout";
import type { Email } from "./staff";

export interface BookingEmailData {
  brand: string;
  siteUrl: string; // https://salonkit.online (logo in the frame)
  salonName: string;
  ref: string;
  when: string; // "Fri 14 Nov, 3:30 pm"
  staff: string;
  services: string[];
  total: string; // "AED 250"
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  note: string | null;
}

const row = (k: string, v: string) =>
  `<tr><td style="padding:8px 0;color:#67635b;font-size:13px;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;font-size:15px;font-weight:600">${v}</td></tr>`;

const table = (rows: string[]) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #ece6d9;margin:16px 0">${rows.join("")}</table>`;

/** To the salon: a new booking from the website, with a button to the Bookings page. */
export function newBookingEmail(to: string, d: BookingEmailData, appUrl: string): Email {
  const subject = `New booking: ${d.customerName}, ${d.when}`;
  const rows = [
    row("When", esc(d.when)),
    row("Client", `${esc(d.customerName)}<br><a href="tel:${esc(d.customerPhone)}" style="color:#0b4a3a">${esc(d.customerPhone)}</a>${d.customerEmail ? `<br>${esc(d.customerEmail)}` : ""}`),
    row("Services", esc(d.services.join(", "))),
    row("With", esc(d.staff)),
    row("Total", esc(d.total)),
    row("Reference", esc(d.ref)),
    ...(d.note ? [row("Note", esc(d.note))] : []),
  ];
  const body = `<p style="margin:0 0 4px;font-size:20px;font-weight:700">New booking at ${esc(d.salonName)}</p>
<p style="margin:0;color:#67635b">Booked online from your website. The time is reserved for the client.</p>
${table(rows)}
${button(`${appUrl}/bookings/`, "Open bookings")}`;
  const text = `New booking at ${d.salonName}\n\nWhen: ${d.when}\nClient: ${d.customerName}, ${d.customerPhone}${d.customerEmail ? `, ${d.customerEmail}` : ""}\nServices: ${d.services.join(", ")}\nWith: ${d.staff}\nTotal: ${d.total}\nReference: ${d.ref}${d.note ? `\nNote: ${d.note}` : ""}\n\n${appUrl}/bookings/`;
  const why = `You get this because online bookings are switched on for ${d.salonName} in ${d.brand}.`;
  return { to, subject, html: emailLayout({ brand: d.brand, siteUrl: d.siteUrl, preheader: `${d.customerName} booked ${d.services.join(", ")} for ${d.when}`, body, footer: esc(why) }), text: `${text}\n\n${why}` };
}

/** To the client (when they gave an email): their booking, with a link to view or cancel it. */
export function bookingConfirmEmail(to: string, d: BookingEmailData, manageUrl: string, salonPhone: string | null): Email {
  const subject = `Your booking at ${d.salonName}: ${d.when}`;
  const rows = [row("When", esc(d.when)), row("Services", esc(d.services.join(", "))), row("With", esc(d.staff)), row("Total", esc(d.total)), row("Reference", esc(d.ref))];
  const body = `<p style="margin:0 0 4px;font-size:20px;font-weight:700">See you soon, ${esc(d.customerName.split(" ")[0] || d.customerName)}</p>
<p style="margin:0;color:#67635b">Your booking at ${esc(d.salonName)} is confirmed.</p>
${table(rows)}
${button(manageUrl, "View or cancel booking")}
${salonPhone ? `<p style="margin:16px 0 0;color:#67635b;font-size:13px">Need to change something? Call ${esc(d.salonName)} on ${esc(salonPhone)}.</p>` : ""}`;
  const text = `Your booking at ${d.salonName} is confirmed.\n\nWhen: ${d.when}\nServices: ${d.services.join(", ")}\nWith: ${d.staff}\nTotal: ${d.total}\nReference: ${d.ref}\n\nView or cancel: ${manageUrl}${salonPhone ? `\nCall: ${salonPhone}` : ""}`;
  const why = `You get this because you booked online with ${d.salonName}.`;
  return { to, subject, html: emailLayout({ brand: d.brand, siteUrl: d.siteUrl, preheader: `Confirmed: ${d.services.join(", ")} on ${d.when}`, body, footer: esc(why) }), text: `${text}\n\n${why}` };
}
