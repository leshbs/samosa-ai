-- Development seed: one organization with a small Indonesian dataset so the
-- dashboard has something to render before any real upload. Dev only.

insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'OSIS SMA Nusantara', 'osis-nusantara')
on conflict (id) do nothing;

insert into public.datasets (
  id, organization_id, uploader_id, name, source, response_count
)
select
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  id,
  'Evaluasi Pensi 2026',
  'csv',
  6
from auth.users
limit 1
on conflict (id) do nothing;

insert into public.responses (dataset_id, organization_id, text)
values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Acaranya seru banget, band-nya keren dan sound system jernih.'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Konsumsi telat hampir dua jam, panitia kurang sigap.'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Antrian tiket terlalu panjang, tolong pakai sistem online tahun depan.'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Secara umum sudah cukup baik, tidak ada keluhan khusus.'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Dekorasi panggung bagus, tapi kursi penonton kurang banyak.'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Panitia ramah dan informatif, terima kasih!')
on conflict do nothing;
