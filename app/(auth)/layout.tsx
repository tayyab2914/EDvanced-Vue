import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
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
        <div className="relative flex items-center gap-3">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-brand text-[16px] font-bold text-white">
            K
          </div>
          <span className="text-[17px] font-semibold text-white">
            K–12 Finance
          </span>
          <span className="ml-1 border-l border-[#2a3a52] pl-3 text-[13px] font-medium text-[#7d8ba3]">
            for School Districts
          </span>
        </div>
        <div className="relative max-w-[420px]">
          <div className="mb-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#4f8bff]">
            District Finance, Clarified
          </div>
          <h1 className="mb-4 text-[34px] font-semibold leading-[1.22] text-white">
            Turn ledgers and spreadsheets into decisions your board can trust.
          </h1>
          <p className="text-[15px] leading-relaxed text-[#9fadc4]">
            Upload, validate, and analyze district financial data in one secure
            workspace — built for finance teams, not engineers.
          </p>
        </div>
        <div className="relative flex gap-7 text-[12.5px] text-[#7d8ba3]">
          <span>Per-district isolation</span>
          <span>Role-based access</span>
          <span>Full audit trail</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-[#f6f8fb] p-8">
        <div className="w-full max-w-[380px] animate-fade-up">{children}</div>
      </div>
    </div>
  );
}
