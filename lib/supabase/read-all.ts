/**
 * How many rows one request returns at most. This is the project's PostgREST
 * `max-rows`: a select that asks for more is cut off here without an error.
 */
export const READ_PAGE_SIZE = 1000

/** A backstop, not a quota: 5,000 answers per dataset is the upload's cap. */
const MAX_ROWS = 100_000

type Page<Row> = { data: Row[] | null; error: unknown }

/**
 * Every row a query matches, read a page at a time.
 *
 * A plain select stops silently at 1,000 rows — measured on the hosted
 * project. A job on a 1,400-answer dataset analysed the first 1,000 and called
 * itself finished; nothing failed, the rest were simply never read. Anything
 * that must see a whole dataset reads it through here.
 *
 * `page` must apply a stable order (end with a unique column), or rows can
 * repeat or go missing between pages.
 */
export async function readAll<Row>(
  page: (from: number, to: number) => PromiseLike<Page<Row>>,
  pageSize: number = READ_PAGE_SIZE,
): Promise<{ data: Row[]; error: unknown }> {
  const rows: Row[] = []

  for (let from = 0; from < MAX_ROWS; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: [], error }

    rows.push(...(data ?? []))
    if ((data ?? []).length < pageSize) break
  }

  return { data: rows, error: null }
}
