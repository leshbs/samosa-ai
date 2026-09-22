/** Public API of the reporting module. */
export { buildReport } from './services/build-report'
export type { BuildReportInput } from './services/build-report'
export { aggregateResults } from './aggregators/report-aggregator'
export type { AggregateInput, ReportAggregate } from './aggregators/report-aggregator'
export { buildDashboardData } from './aggregators/dashboard'
export type { DashboardData, DashboardOptions } from './aggregators/dashboard'
export { aggregateSentiment } from './aggregators/sentiment'
export type { SentimentDistribution } from './aggregators/sentiment'
export { aggregateTopics, DEFAULT_TOP_TOPICS } from './aggregators/topics'
export type { TopicCount } from './aggregators/topics'
export { aggregateKeywords, DEFAULT_TOP_KEYWORDS } from './aggregators/keywords'
export type { KeywordCount } from './aggregators/keywords'
export { topResponsesByTopic, DEFAULT_QUOTES_PER_TOPIC } from './aggregators/quotes'
export type { QuotableRecord, TopicQuotes } from './aggregators/quotes'
export { crossTabTopicSentiment } from './aggregators/cross-tab'
export type { TopicSentimentRow } from './aggregators/cross-tab'
export type { AnalyzedRecord, CountedTerm } from './aggregators/types'
export { generateReportSummary, getStoredSummary } from './services/summary-generator'
export type {
  GenerateSummaryInput,
  GeneratedSummary,
  StoredSummary,
} from './services/summary-generator'
export { exportReportToCsv, exportResponsesToCsv } from './exporters/csv-exporter'
export type { ExportableResponse } from './exporters/csv-exporter'
export { exportReportToPdf } from './exporters/pdf-exporter'
export type { PdfExport, ReportDocumentData } from './exporters/pdf-exporter'
