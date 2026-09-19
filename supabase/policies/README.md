# RLS policies

Policy SQL hidup bersama migration-nya di `supabase/migrations/` supaya urutan
penerapan terjamin (tabel dibuat dulu, baru policy). Folder ini menyimpan
catatan dan skrip verifikasi policy.

Policy aktif ada di `supabase/migrations/20260919000200_rls_policies.sql`.

Aturan: setiap tabel tenant-scoped wajib `enable row level security` dan setiap
policy memfilter lewat `public.current_org_ids()` atau `public.has_org_role()`.
Mutasi tulis sengaja dibiarkan tertutup — penulisan dilakukan background job
memakai service-role client setelah modul auth mengecek permission.
