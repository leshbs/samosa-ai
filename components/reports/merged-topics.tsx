/**
 * Which labels each merged topic stands for, behind a disclosure.
 *
 * A bar that says "kepercayaan diri · 64" is 49 answers the model labelled
 * that way and 15 it labelled "percaya diri". The merge is a judgement, made
 * by a model, and this list is what lets a reader check it: nothing is counted
 * together here without saying so.
 *
 * `<details>` for the same reason as the topic tail: no JavaScript, and it
 * works before hydration.
 */
export function MergedTopics({
  groups,
}: {
  groups: ReadonlyArray<{ term: string; from: readonly string[] }>
}) {
  if (groups.length === 0) return null

  const labels = groups.reduce((sum, group) => sum + group.from.length, 0)

  return (
    <details className="group rounded-md border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none">
        <span className="text-muted-foreground group-open:hidden">
          Lihat {labels} label yang dihitung bersama topik lain
        </span>
        <span className="hidden text-muted-foreground group-open:inline">
          Sembunyikan label yang dihitung bersama topik lain
        </span>
      </summary>

      <div className="space-y-3 border-t px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          Label yang menunjuk hal yang sama dihitung sebagai satu topik. Label asli tiap
          jawaban tetap tersimpan dan ikut di unduhan CSV.
        </p>
        <ul className="space-y-1">
          {groups.map((group) => (
            <li key={group.term}>
              <span className="font-medium">{group.term}</span>
              <span className="text-muted-foreground"> mencakup </span>
              {group.from.join(', ')}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
