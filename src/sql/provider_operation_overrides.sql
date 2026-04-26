-- Tabel override jam operasional per-provider (upsert 1 row per provider)
-- override_type: 'open' (Buka Sekarang) atau 'close' (Tutup Sekarang)
create table if not exists public.provider_operation_overrides (
    provider text primary key,
    override_type text not null,
    expires_at timestamptz null,
    manual_close_start timestamptz null,
    manual_close_end timestamptz null,
    created_at timestamptz not null default now()
);

create index if not exists idx_provider_overrides_type
    on public.provider_operation_overrides (override_type);
