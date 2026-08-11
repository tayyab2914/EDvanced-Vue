"use client";

import { logout } from "@/app/actions/auth";

function DoorIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/**
 * Sign out.
 *
 * Two shapes, one action. `icon` is the bare glyph that sits beside the account row on the
 * collapsed rail, where there is no room for a word. `full` is the redesign's block button
 * at the foot of the expanded sidebar — solid black on the panel's translucent card, lifted
 * by a warm shadow rather than a fill, so the only saturated thing in the rail is not also
 * the most destructive control in it.
 */
export function LogoutButton({
  variant = "icon",
}: {
  variant?: "icon" | "full";
}) {
  if (variant === "full") {
    return (
      <form action={logout} className="w-full">
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-black pl-5 pr-6 text-[14px] font-semibold text-white drop-shadow-[0_4px_12px_rgba(204,100,6,0.3)] transition-opacity hover:opacity-90"
        >
          <DoorIcon size={20} />
          Log Out
        </button>
      </form>
    );
  }

  return (
    <form action={logout}>
      <button
        type="submit"
        title="Sign out"
        aria-label="Sign out"
        className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-[#6f8099] transition-colors hover:bg-white/10 hover:text-[#cfd9e8]"
      >
        <DoorIcon />
      </button>
    </form>
  );
}
