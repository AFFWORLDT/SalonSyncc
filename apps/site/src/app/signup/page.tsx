import type { Metadata } from "next";
import { SiteNav } from "@/components/nav";
import { SignupForm } from "@/components/signup-form";
import { ShaderBackdrop } from "@/components/ui/shader-backdrop";

export const metadata: Metadata = { title: "Start your free trial" };

export default function SignupPage() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden px-5 pb-16 pt-24 sm:px-8">
      <ShaderBackdrop />
      <SiteNav />
      <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="text-[#fffdf8]">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Your salon, live in a minute.</h1>
          <p className="mt-4 max-w-md text-lg text-[#fffdf8]/80">
            Pick your salon ID and you get your own address, ready for bills, staff and reports. Every salon starts with 7 days
            of Pro Max, free.
          </p>
          <ul className="mt-6 space-y-2 text-[15px] text-[#fffdf8]/85">
            <li>✓ Bills, commission and the daily sheet from day one</li>
            <li>✓ Your currency, time zone and VAT</li>
            <li>✓ Add your barbers and services in minutes</li>
          </ul>
        </div>
        <div className="glass rounded-2xl p-6 shadow-2xl sm:p-8">
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
