-- Private bucket for raw uploads. Objects are keyed <organization_id>/<file>,
-- so the first path segment is the tenant boundary.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'datasets',
  'datasets',
  false,
  10485760, -- 10 MB, matches MAX_UPLOAD_BYTES in types/api.ts
  array[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

create policy datasets_bucket_read on storage.objects
  for select
  using (
    bucket_id = 'datasets'
    and (storage.foldername(name))[1] in (select public.current_org_ids()::text)
  );
