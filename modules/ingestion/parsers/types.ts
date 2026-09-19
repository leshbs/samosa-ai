export type SheetRow = Record<string, string>

export type ParsedSheet = {
  columns: string[]
  rows: SheetRow[]
}
