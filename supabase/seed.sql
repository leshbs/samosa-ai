-- Development seed: one organization, two users, and a small Indonesian dataset
-- so the dashboard has something to render before any real upload. Dev only —
-- these credentials are published in the repo and must never reach production.
--
--   owner@samosa.test  / samosa123
--   member@samosa.test / samosa123

insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'OSIS SMA Nusantara', 'osis-nusantara')
on conflict (id) do nothing;

-- Written straight into auth.users because the seed runs without a GoTrue server.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1',
    'authenticated',
    'authenticated',
    'owner@samosa.test',
    crypt('samosa123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ketua OSIS"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a2',
    'authenticated',
    'authenticated',
    'member@samosa.test',
    crypt('samosa123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Anggota Sekbid"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

-- Without a matching identity row GoTrue refuses the password grant.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email in ('owner@samosa.test', 'member@samosa.test')
on conflict (provider, provider_id) do nothing;

insert into public.organization_members (user_id, organization_id, role)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000001',
    'owner'
  ),
  (
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-000000000001',
    'member'
  )
on conflict (user_id, organization_id) do nothing;

insert into public.datasets (
  id, organization_id, uploader_id, name, source, response_count, metadata
)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'Evaluasi Pensi 2026',
  'csv',
  6,
  '{"text_column_name":"Aspirasi"}'::jsonb
)
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
