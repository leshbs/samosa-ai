/** Public API of the reporting module. */
export { buildReport } from './services/build-report'
export type { BuildReportInput } from './services/build-report'
export { aggregateResults } from './aggregators/report-aggregator'
export type { AggregateInput, ReportAggregate } from './aggregators/report-aggregator'
export { buildDashboardData } from './aggregators/dashboard'
export type { DashboardData, DashboardOptions } from './aggregators/dashboard'
export { buildHomeSummary, RECENT_LIMIT, TREND_POINTS } from './aggregators/home'
export type {
  HomeJob,
  HomeSummary,
  HomeSummaryInput,
  LatestReport,
  RecentAnalysis,
} from './aggregators/home'
export { aggregateSentiment } from './aggregators/sentiment'
export type { SentimentDistribution } from './aggregators/sentiment'
export { aggregateTopics, DEFAULT_TOP_TOPICS } from './aggregators/topics'
export type { TopicCount } from './aggregators/topics'
export { aggregateKeywords, DEFAULT_TOP_KEYWORDS } from './aggregators/keywords'
export type { KeywordCount } from './aggregators/keywords'
export { topResponsesByTopic, DEFAULT_QUOTES_PER_TOPIC } from './aggregators/quotes'
export type { QuotableRecord, TopicQuotes } from './aggregators/quotes'
export {
  crossTabTopicSentiment,
  crossTabTopicSentimentWithOther,
  OTHER_TOPIC_LABEL,
} from './aggregators/cross-tab'
export type { TopicSentimentRow, TopicSentimentBreakdown } from './aggregators/cross-tab'
export { distributeTopics } from './aggregators/topics'
export { distributeTerms, summarizeTail } from './aggregators/types'
export type { AnalyzedRecord, CountedTerm, TermDistribution } from './aggregators/types'
export { generateReportSummary, getStoredSummary } from './services/summary-generator'
export type {
  GenerateSummaryInput,
  GeneratedSummary,
  StoredSummary,
} from './services/summary-generator'
export { exportReportToCsv, exportResponsesToCsv } from './exporters/csv-exporter'
export type { ExportableResponse } from './exporters/csv-exporter'
export { exportReportToPdf } from './exporters/pdf-exporter'
export type {
  PdfExport,
  ReportDocumentData,
  ReportProvenance,
} from './exporters/pdf-exporter'
export { exportDatasetToCsv } from './exporters/csv-exporter'
export type { ExportableDatasetRow } from './exporters/csv-exporter'
export { archiveSlug, buildArchive } from './exporters/archive'
export type { ArchiveEntry } from './exporters/archive'
