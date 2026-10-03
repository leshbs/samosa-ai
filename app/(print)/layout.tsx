/**
 * Pages meant for paper. No sidebar, no navigation, and always the light
 * palette: `.print-doc` pins the colour tokens, because a report printed from
 * dark mode should still come out as ink on white.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-doc min-h-dvh">{children}</div>
}
