import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo";
import { COMPANY, OFFICE_ADDRESS } from "@/lib/brand";
import { LEGAL_EMAIL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What SalonKit collects, why, who processes it, and how to get your data or have it deleted.",
  alternates: { canonical: "/privacy/" },
  openGraph: pageOpenGraph("/privacy/", "Privacy Policy", "What SalonKit collects, why, who processes it, and how to get your data or have it deleted."),
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`SalonKit is salon software (the website salonkit.online, each salon's address on it, and the SalonKit phone app), run by ${COMPANY} in the United Arab Emirates ("we"). This policy explains what we collect, why, and the choices you have.`}
      sections={[
        {
          title: "Who this covers",
          body: [
            "Salon owners and their staff who use SalonKit, and the salons' customers whose details a salon records in SalonKit.",
            "For customer details, the salon decides what to record and why; we store and process them for the salon. Questions about a salon's own records are best sent to that salon.",
          ],
        },
        {
          title: "What we collect",
          body: [
            [
              "Account details: name, email, mobile number and password (stored only as a secure hash). If you sign in with Google or Apple, we receive your verified email address and name from them, nothing else.",
              "Salon details: salon name, address, logo, tax number, services, prices, staff and their roles, commission settings.",
              "Business records the salon creates: bills, payments, expenses, appointments, customer names and phone numbers, ratings and feedback.",
              "Device details for the phone app: device name, app version and a push-notification token, so the app can sign you in and send you alerts.",
              "Technical data: IP address, browser type and request logs, kept for security, rate limiting and troubleshooting. Crash reports from the phone app.",
              "Website analytics: pages visited on salonkit.online, through Google Analytics.",
            ],
          ],
        },
        {
          title: "How we use it",
          body: [
            [
              "To run the service: sign you in, keep your salon's records, print and send bills, and show reports.",
              "To send messages you or your salon switch on: sign-in codes, password resets, receipts, reminders and rating requests by email, WhatsApp or push notification.",
              "To bill subscriptions and keep the service secure (fraud and abuse prevention).",
              "To fix problems and improve SalonKit.",
            ],
            "We do not sell personal data, and we do not use salon or customer records for advertising.",
          ],
        },
        {
          title: "Who processes data for us",
          body: [
            "We use these providers only to run SalonKit, each under its own terms:",
            [
              "Cloudflare: hosting, database, storage and bot checks (Turnstile).",
              "Google Firebase: Google and Apple sign-in checks, push notifications and app crash reports.",
              "Google Analytics: website visit statistics.",
              "Resend: sending emails.",
              "Meta (WhatsApp Business): WhatsApp messages, only for salons that connect their own WhatsApp account.",
              "Stripe: subscription payments. We never see or store full card numbers.",
            ],
            "Data may be processed outside the UAE by these providers, with the safeguards they provide.",
          ],
        },
        {
          title: "Google user data",
          body: [
            "When you choose \"Continue with Google\", we receive only your email address, whether Google has verified it, your name and a Google account ID. We use them only to sign you in to your own salon or to create your salon account. We do not access your Gmail, contacts, calendar, Drive or any other Google data, and we do not share Google user data with anyone except as needed to provide this sign-in.",
            "SalonKit's use of information received from Google APIs follows the Google API Services User Data Policy, including the Limited Use requirements.",
          ],
        },
        {
          title: "How long we keep it",
          body: [
            "While a salon's account is open, we keep its records so the salon can use them. When a salon closes its account, we delete or anonymise its data within 90 days, except what we must keep by law (for example invoices for tax). Security logs are kept for a short period.",
          ],
        },
        {
          title: "Your choices and rights",
          body: [
            "You can see and change most of your details in SalonKit itself. You can ask us for a copy of your data, to correct it, or to delete your account and data, by emailing " +
              LEGAL_EMAIL +
              " from the email on your account. Salon customers can ask the salon, or us, to remove their details.",
          ],
        },
        {
          title: "Security",
          body: ["Data travels over HTTPS, passwords are hashed, each salon's records are kept separate from every other salon's, and access inside a salon follows the roles the owner sets."],
        },
        {
          title: "Children",
          body: ["SalonKit is for businesses and is not meant for children under 16."],
        },
        {
          title: "Changes",
          body: ["If we change this policy, we update the date above, and for important changes we tell salon owners by email or in the app."],
        },
        {
          title: "Contact",
          body: [`${COMPANY}, ${OFFICE_ADDRESS}. Email: ${LEGAL_EMAIL}`],
        },
      ]}
    />
  );
}
