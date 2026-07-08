// Minimal inline stroke icons (no external deps).
const S = (path: string) => (props: { size?: number }) =>
  (
    <svg
      width={props.size || 18}
      height={props.size || 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path.split('|').map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );

export const Icons = {
  dashboard: S('M3 3h8v8H3zM13 3h8v5h-8zM13 12h8v9h-8zM3 15h8v6H3z'),
  book: S('M4 19.5A2.5 2.5 0 0 1 6.5 17H20|M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'),
  users: S('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75'),
  calendar: S('M3 4h18v18H3zM3 10h18M8 2v4M16 2v4'),
  check: S('M20 6 9 17l-5-5'),
  settings: S('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 9.4l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6V4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H20a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-.51 1z'),
  clipboard: S('M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1z|M9 4h6'),
  megaphone: S('M3 11l18-5v12L3 14v-3z|M11.6 16.8a3 3 0 1 1-5.8-1.6'),
  chart: S('M3 3v18h18|M18 17V9M13 17V5M8 17v-3'),
  logout: S('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9'),
  plus: S('M12 5v14M5 12h14'),
};
