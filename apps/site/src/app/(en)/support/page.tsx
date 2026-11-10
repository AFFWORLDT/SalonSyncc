import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo";
import { COMPANY, OFFICE_ADDRESS } from "@/lib/brand";
import { LEGAL_EMAIL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with SalonKit: email our team, sign-in help, the phone app and deleting your account.",
  alternates: { canonical: "/support/" },
  openGraph: pageOpenGraph("/support/", "Support", "Get help with SalonKit: email our team, sign-in help, the phone app and deleting your account."),
};

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      intro={`Need a hand with SalonKit? Email ${LEGAL_EMAIL} and our team will get back to you, usually within one working day.`}
      sections={[
        {
          title: "Contact us",
          body: [[`Email: ${LEGAL_EMAIL}`, `In the app: Profile → Get support`, `Office: ${COMPANY}, ${OFFICE_ADDRESS}`]],
        },
        {
          title: "Signing in",
          body: [
            "Sign in with the email on your account (we email you a code), with Google or Apple, or with your salon ID, username and password. Forgot your password? Tap “Forgot password?” on the sign-in screen, or ask your salon owner to reset it in Staff.",
          ],
        },
        {
          title: "The phone app",
          body: [
            "SalonKit runs on iPhone, iPad and Android. Your salon's data is the same on the phone and on the web, so you can switch any time. Keep the app updated for the latest features and fixes.",
          ],
        },
        {
          title: "Deleting your account",
          body: [
            "Open Profile in the app and tap Delete account. Staff accounts are deleted straight away. When the salon owner deletes their account, the salon is closed, everyone is signed out and personal details are erased. See our Privacy Policy for how long other records are kept.",
          ],
        },
      ]}
    />
  );
}
