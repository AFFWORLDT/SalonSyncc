import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo";
import { COMPANY } from "@/lib/brand";
import { LEGAL_EMAIL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your SalonKit account, in the app or by email, and what happens to your data.",
  alternates: { canonical: "/delete-account/" },
  openGraph: pageOpenGraph("/delete-account/", "Delete your account", "How to delete your SalonKit account, in the app or by email, and what happens to your data."),
};

export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      intro={`You can delete your SalonKit account (the SalonKit app by ${COMPANY}) at any time, in the app or by email.`}
      sections={[
        {
          title: "In the app",
          body: [["Open the SalonKit app and sign in", "Tap your photo (top right) to open Profile", "Tap Delete account and confirm"]],
        },
        {
          title: "By email",
          body: [
            `Can't open the app? Email ${LEGAL_EMAIL} from the email or phone number on your account, with your salon ID and username, and ask us to delete your account. We confirm it's you and delete it within 30 days.`,
          ],
        },
        {
          title: "What is deleted",
          body: [
            "Staff accounts: your sign-in is closed straight away, and your email, phone number, photo and signed-in devices are removed. Your name stays on the sales you rang up, because they are the salon's business records.",
            "Salon owners: deleting the owner account closes the salon straight away. Everyone is signed out and every staff member's email, phone number and photo are removed. The salon's remaining records (customers, sales, settings) are deleted or anonymised within 90 days.",
          ],
        },
        {
          title: "What we keep",
          body: [
            "Invoices and records we must keep by law (for example for tax) are kept for as long as the law requires, then deleted. Security logs are kept for a short period. See our Privacy Policy for details.",
          ],
        },
      ]}
    />
  );
}
