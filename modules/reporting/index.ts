/** Public API of the reporting module. */
export { buildReport } from './services/build-report'
export type { BuildReportInput } from './services/build-report'
export { aggregateResults } from './aggregators/report-aggregator'
export type { AggregateInput, ReportAggregate } from './aggregators/report-aggregator'
export { exportReportToCsv } from './exporters/csv-exporter'
export { exportReportToPdf } from './exporters/pdf-exporter'
export type { PdfExport } from './exporters/pdf-exporter'
