import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo";
import { COMPANY } from "@/lib/brand";
import { LEGAL_EMAIL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using SalonKit: accounts, trials and plans, your data, acceptable use and liability.",
  alternates: { canonical: "/terms/" },
  openGraph: pageOpenGraph("/terms/", "Terms of Service", "The terms for using SalonKit: accounts, trials and plans, your data, acceptable use and liability."),
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are an agreement between your salon and ${COMPANY} ("we") for using SalonKit: the website salonkit.online, your salon's address on it and the SalonKit phone app. By creating a salon or signing in, you agree to them.`}
      sections={[
        {
          title: "Your account",
          body: [
            "The person who creates a salon is its owner and is responsible for the salon's account, its staff accounts and everything done with them. Keep sign-in details private and tell us at once if you think an account has been misused.",
          ],
        },
        {
          title: "Trial, plans and payment",
          body: [
            "New salons get a free trial. After it, the salon can stay on the Free plan or pay for a plan shown on our pricing page. Paid plans renew each billing period until cancelled; prices are in AED and include or add VAT as shown. If a payment fails, paid features may stop after a grace period. Fees already paid are not refunded unless the law requires it.",
          ],
        },
        {
          title: "Your data",
          body: [
            "Your salon's records belong to your salon. You give us permission to store and process them only to provide SalonKit, as described in our Privacy Policy. You are responsible for having the right to record your customers' details and to send them messages (for example WhatsApp or email), and for following the laws that apply to your business, including tax rules for your bills.",
          ],
        },
        {
          title: "Acceptable use",
          body: [
            [
              "Don't use SalonKit for anything unlawful, or to send spam or messages people didn't agree to.",
              "Don't try to break in, overload the service, or access another salon's data.",
              "Don't copy, resell or reverse-engineer SalonKit.",
            ],
            "We may suspend an account that breaks these rules, after telling the owner where we reasonably can.",
          ],
        },
        {
          title: "The service",
          body: [
            "We work to keep SalonKit available and your data safe, but the service is provided \"as is\": there may be interruptions, and features may change. Messages sent through third parties (WhatsApp, email, push) depend on those services.",
          ],
        },
        {
          title: "Liability",
          body: [
            "To the extent the law allows, we are not liable for indirect or consequential losses (such as lost profits or lost business), and our total liability for any claim is limited to the fees your salon paid us in the 12 months before the claim.",
          ],
        },
        {
          title: "Closing your account",
          body: [
            "You can stop using SalonKit at any time; email us to close your salon's account. You can ask for a copy of your data before it is deleted. We may close accounts that stay unpaid or unused for a long time, with notice to the owner.",
          ],
        },
        {
          title: "Changes and law",
          body: [
            "We may update these terms; the date above shows the latest version, and we tell owners about important changes. These terms are governed by the laws of the United Arab Emirates, and the courts of Dubai have jurisdiction.",
          ],
        },
        {
          title: "Contact",
          body: [`${COMPANY}, United Arab Emirates. Email: ${LEGAL_EMAIL}`],
        },
      ]}
    />
  );
}
