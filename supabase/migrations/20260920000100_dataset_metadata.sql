-- Column mapping (see docs/OVERVIEW.md): a Google Forms export has many columns
-- and the uploader picks which one holds the aspiration text. Keeping the choice
-- on the dataset means a re-import can reproduce exactly the same responses.

alter table public.datasets
  add column metadata jsonb not null default '{}'::jsonb;

comment on column public.datasets.metadata is
  'Ingestion settings. text_column_name: header the responses were taken from.';
