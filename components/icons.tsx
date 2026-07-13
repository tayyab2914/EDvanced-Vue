import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "database"
  | "users"
  | "settings"
  | "activity"
  | "building"
  | "reports"
  | "search"
  | "pencil"
  | "trash"
  | "power"
  | "filter"
  | "eye"
  | "mail"
  | "key"
  | "unlock"
  | "shield"
  | "book"
  | "chart";

const PATHS: Record<IconName, string> = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 20a5.5 5.5 0 0 0-3-4.9"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  building:
    '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 8h2a2 2 0 0 1 2 2v11"/><path d="M2 21h20"/><path d="M8 7h2M8 11h2M8 15h2"/>',
  reports:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  pencil:
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash:
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
  power: '<path d="M12 3v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9"/><path d="m17 6 3 3"/><path d="m14 9 3 3"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/>',
  shield:
    '<path d="M12 2.8 20 6v5.2c0 4.8-3.3 8.4-8 10.1-4.7-1.7-8-5.3-8-10.1V6l8-3.2Z"/><path d="m8.8 11.8 2.2 2.2 4.2-4.4"/>',
  book: '<path d="M12 6.6C10.6 5.1 8.6 4.4 6 4.4H3.2v13.9H6c2.6 0 4.6.7 6 2.2 1.4-1.5 3.4-2.2 6-2.2h2.8V4.4H18c-2.6 0-4.6.7-6 2.2Z"/><path d="M12 6.6v13.9"/>',
  chart:
    '<path d="M3.5 20.5h17"/><rect x="5.5" y="12.5" width="3.4" height="5"/><rect x="10.3" y="8.5" width="3.4" height="9"/><rect x="15.1" y="4.5" width="3.4" height="13"/>',
};

export function Icon({
  name,
  size = 19,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
      {...props}
    />
  );
}
