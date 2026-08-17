import { CubeGlyph } from "@/components/dashboard/expenditure-status-strip";
import type { StatusRung } from "@/lib/dashboard/status";

/**
 * "Reserve status" — a transcription of Figma 55:3725, the Fund Balance band's centred
 * verdict card. The same construction as the Expenditure status strip's left pane — white
 * bordered card, 15px title, the verdict in 32px of its own ink with the cube glyph drawn
 * beside it in the same colour — but standing alone under the Overview tiles, at the
 * design's 335px, with the policy caption in plain grey and the warning rule as the tinted
 * pill.
 */

/** The verdict's ink, along the reserve ladder — same palette the strip's verdict wears. */
const VERDICT_INK: Record<StatusRung, string> = {
  Strong: "#1a932e",
  Acceptable: "#1a932e",
  Monitor: "#e65f2b",
  "Action Required": "#fd4438",
  "N/A": "#797979",
};

export function FundBalanceStatusCard({
  rung,
  note,
  chip,
}: {
  rung: StatusRung;
  /** "Compared to Board reserve policy" — the grey caption under the verdict. */
  note: string;
  /** "Warning below 4.00%" — the tinted capsule at the card's floor. */
  chip: string;
}) {
  const ink = VERDICT_INK[rung];

  return (
    <div
      data-reveal
      className="mx-auto flex w-[335px] max-w-full flex-col gap-[6px] rounded-[24px] bg-[#FFFFFF9E] p-[16px]"
    >
      <div className="flex items-start justify-between gap-[8px]">
        <div className="flex min-w-0 flex-col items-start gap-[8px]">
          <span className="text-[14px] font-medium leading-[20px] text-[#060606]">
            Reserve Status
          </span>
          <span
            className="whitespace-nowrap text-[32px] font-medium leading-[36px]"
            style={{ color: ink }}
          >
            {rung === "N/A" ? "Not available" : rung}
          </span>
        </div>
        <span aria-hidden className="flex size-[71px] flex-none items-center justify-center">
          <CubeGlyph color={ink} />
        </span>
      </div>
      <span className="text-[12px] leading-normal text-[#060606]">{note}</span>
      <span
        className="inline-flex w-fit items-center rounded-[20px] px-[8px] py-[1px] text-[10px] leading-normal tracking-[0.1px]"
        style={{ background: "rgba(230,95,43,0.18)", color: "#e65f2b" }}
      >
        {chip}
      </span>
    </div>
  );
}
