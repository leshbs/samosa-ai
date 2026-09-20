/** Public API of the ingestion module. */
export { uploadDataset } from './services/upload-dataset'
export type { UploadDatasetInput, UploadDatasetOutput } from './services/upload-dataset'
export { parseCsv, parseXlsx } from './parsers'
export type { ParsedSheet, SheetRow } from './parsers'
export {
  listDatasets,
  getDataset,
  listResponses,
  deleteDataset,
  RESPONSES_PAGE_SIZE,
} from './services/dataset-queries'
export type { ResponsePage } from './services/dataset-queries'
export { previewDataset, PREVIEW_ROW_COUNT } from './services/preview-dataset'
export type { DatasetPreview } from './services/preview-dataset'
export { extractResponses, validateUploadSize } from './validators/dataset-validator'
export type { ExtractedResponse, ExtractionReport } from './validators/dataset-validator'
