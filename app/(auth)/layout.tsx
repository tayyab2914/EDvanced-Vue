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
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Marketing panel. Corner-to-corner navy (135deg = top-left → bottom-right), no
          overlay pattern — the gradient carries the panel on its own. */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-14 lg:flex"
        style={{ backgroundImage: "linear-gradient(135deg,#0F2747,#08182E)" }}
      >
        <div className="relative">
          <Logo size={40} onDark tagline />
        </div>

        <div className="relative max-w-[560px]">
          <div className="mb-4 text-[13px] font-semibold uppercase tracking-[0.16em] text-logo-green">
            Financial Intelligence
          </div>
          <h1 className="mb-5 text-[40px] font-semibold leading-[1.18] text-white">
            Transforming Financial Data into Executive Insight
          </h1>
          <p className="text-[17px] leading-relaxed text-[#9fadc4]">
            Upload. Validate. Analyze.
            <br />
            Make confident decisions your board can trust.
          </p>

          <ul className="mt-12 space-y-7">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-4">
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-[#25354d] bg-white/4 text-logo-green">
                  <Icon name={f.icon} size={22} />
                </span>
                <div>
                  <div className="text-[16px] font-semibold text-white">
                    {f.title}
                  </div>
                  <div className="mt-0.5 text-[14px] text-[#8fa1bb]">
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
