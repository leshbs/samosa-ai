// lib/env.ts validates at import time; give it deterministic values so unit
// tests never depend on a developer's .env.local.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
process.env.OPENAI_API_KEY ??= 'test-openai-key'
process.env.OPENAI_MODEL ??= 'gpt-4o-mini'
process.env.WORKER_SECRET ??= 'test-worker-secret'
