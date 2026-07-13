import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";

const FEATURES: { icon: IconName; title: string; detail: string }[] = [
  {
    icon: "shield",
    title: "Secure Multi-Tenant Platform",
    detail: "Enterprise-grade security for every district.",
  },
  {
    icon: "book",
    title: "Florida Red Book Validation",
    detail: "Built-in rules. Built for compliance.",
  },
  {
    icon: "chart",
    title: "Executive Financial Dashboards",
    detail: "Clarity today. Better decisions tomorrow.",
  },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Marketing panel */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-14 lg:flex"
        style={{ backgroundImage: "linear-gradient(160deg,#0f2038,#0a1524)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />

        <div className="relative">
          <Logo size={40} onDark tagline />
        </div>

        <div className="relative max-w-115">
          <div className="mb-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-logo-green">
            Financial Intelligence
          </div>
          <h1 className="mb-5 text-[34px] font-semibold leading-[1.22] text-white">
            Transforming Financial Data into Executive Insight
          </h1>
          <p className="text-[15px] leading-relaxed text-[#9fadc4]">
            Upload. Validate. Analyze.
            <br />
            Make confident decisions your board can trust.
          </p>

          <ul className="mt-12 space-y-7">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-4">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-[#25354d] bg-white/4 text-logo-green">
                  <Icon name={f.icon} size={20} />
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-white">
                    {f.title}
                  </div>
                  <div className="mt-0.5 text-[13px] text-[#8fa1bb]">
                    {f.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-4 text-[12px] text-[#7d8ba3]">
          <span>© {year} EDvanced Vue, LLC. All rights reserved.</span>
          <span className="text-[#2a3a52]">|</span>
          <span>Privacy Policy</span>
          <span className="text-[#2a3a52]">|</span>
          <span>Terms of Service</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-[#f6f8fb] p-8">
        <div className="w-full max-w-[380px] animate-fade-up">{children}</div>
      </div>
    </div>
  );
}
