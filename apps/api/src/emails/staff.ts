import { button, emailLayout, esc } from "./layout";

/** What every staff email needs: the brand frame, the salon, and where to open the app. */
export interface StaffEmailBase {
  brand: string;
  siteUrl: string; // https://salonkit.online (logo in the frame)
  salonName: string;
  appUrl: string; // https://<slug>.salonkit.online
  to: string;
  name: string; // the staff member
}

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

function frame(b: StaffEmailBase, subject: string, preheader: string, body: string, text: string): Email {
  const why = `You get this because ${b.salonName} added your email to ${b.brand}. To stop these emails, ask them to remove it from your staff profile.`;
  return {
    to: b.to,
    subject,
    html: emailLayout({ brand: b.brand, siteUrl: b.siteUrl, preheader, body, footer: esc(why) }),
    text: `${text}\n\n${b.appUrl}\n\n${why}`,
  };
}

const stat = (label: string, value: string, hint = "") =>
  `<td style="padding:12px;border:1px solid #ece6d9;border-radius:12px;width:33%" valign="top">
<div style="font-size:12px;color:#67635b">${esc(label)}</div>
<div style="font-size:20px;font-weight:700;margin-top:2px">${esc(value)}</div>${hint ? `<div style="font-size:12px;color:#67635b;margin-top:2px">${esc(hint)}</div>` : ""}</td>`;

const stats = (cells: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="8" style="width:100%;margin:16px -8px;border-collapse:separate">${`<tr>${cells.join("")}</tr>`}</table>`;

/** "Your day at <salon>": customers, sales and commission, against the day before. */
export function staffDailyEmail(b: StaffEmailBase & { dayLabel: string; count: number; sales: string; commission: string; vs: string | null }): Email {
  const subject = b.count ? `Your day at ${b.salonName}: ${b.sales} from ${b.count} customer${b.count === 1 ? "" : "s"}` : `Your day at ${b.salonName}: no sales logged`;
  const lead = b.count
    ? `Nice work today, ${esc(first(b.name))}. Here is your ${esc(b.dayLabel)} at <b>${esc(b.salonName)}</b>.`
    : `Hi ${esc(first(b.name))}, no sales were logged for you on ${esc(b.dayLabel)} at <b>${esc(b.salonName)}</b>. If that's not right, add them in the app.`;
  const body = `<h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px">Your day</h1>
<p style="margin:0;font-size:15px;line-height:23px;color:#3d3a34">${lead}</p>
${stats([stat("Customers", String(b.count)), stat("Sales", b.sales, b.vs ?? ""), stat("Your commission", b.commission)])}
${button(b.appUrl, "Open my day")}`;
  const text = `Your day at ${b.salonName} (${b.dayLabel})\nCustomers: ${b.count}\nSales: ${b.sales}${b.vs ? ` (${b.vs})` : ""}\nYour commission: ${b.commission}`;
  return frame(b, subject, `${b.count} customers · ${b.sales} · commission ${b.commission}`, body, text);
}

/** "Your <month> at <salon>": the month's customers, sales, commission and best day. */
export function staffMonthlyEmail(b: StaffEmailBase & { monthLabel: string; count: number; sales: string; commission: string; days: number; best: string | null }): Email {
  const subject = `Your ${b.monthLabel} at ${b.salonName}: ${b.sales}, commission ${b.commission}`;
  const body = `<h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px">Your ${esc(b.monthLabel)}</h1>
<p style="margin:0;font-size:15px;line-height:23px;color:#3d3a34">Hi ${esc(first(b.name))}, here is how ${esc(b.monthLabel)} went for you at <b>${esc(b.salonName)}</b>.</p>
${stats([stat("Customers", String(b.count), `${b.days} working day${b.days === 1 ? "" : "s"}`), stat("Sales", b.sales, b.best ? `best day ${b.best}` : ""), stat("Your commission", b.commission)])}
${button(b.appUrl, "See my history")}`;
  const text = `Your ${b.monthLabel} at ${b.salonName}\nCustomers: ${b.count} over ${b.days} days\nSales: ${b.sales}${b.best ? ` (best day ${b.best})` : ""}\nYour commission: ${b.commission}`;
  return frame(b, subject, `${b.count} customers · ${b.sales} · commission ${b.commission}`, body, text);
}

/** An announcement from the salon, by email too. */
export function staffAnnouncementEmail(b: StaffEmailBase & { from: string; title: string; message: string }): Email {
  const paras = b.message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:23px;color:#3d3a34">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const body = `<p style="margin:0 0 4px 0;font-size:13px;color:#67635b">Announcement from ${esc(b.from)} · ${esc(b.salonName)}</p>
<h1 style="margin:0 0 14px 0;font-size:22px;line-height:28px">${esc(b.title)}</h1>
${paras}
${button(b.appUrl, "Open the app")}`;
  return frame(b, `${b.salonName}: ${b.title}`, b.message.slice(0, 120), body, `${b.title}\n\n${b.message}\n\n— ${b.from}, ${b.salonName}`);
}

/** The admin changed or deleted one of the barber's sales. */
export function staffSaleChangedEmail(b: StaffEmailBase & { admin: string; billNo: string; action: "changed" | "deleted"; detail: string }): Email {
  const what = b.action === "deleted" ? "deleted" : "changed";
  const subject = `${b.admin} ${what} your bill ${b.billNo}`;
  const body = `<h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px">Your bill was ${what}</h1>
<p style="margin:0;font-size:15px;line-height:23px;color:#3d3a34">${esc(b.admin)} ${what} bill <b>${esc(b.billNo)}</b> at ${esc(b.salonName)}.</p>
<p style="margin:12px 0 0 0;font-size:14px;line-height:22px;color:#67635b">${esc(b.detail)}</p>
${button(b.appUrl, "See my bills")}`;
  return frame(b, subject, `${b.billNo}: ${b.detail}`, body, `${b.admin} ${what} bill ${b.billNo} at ${b.salonName}.\n${b.detail}`);
}
