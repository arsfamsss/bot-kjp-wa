create table if not exists public.blocked_locations (
    id bigserial primary key,
    location_key text not null unique,
    reason text null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_blocked_locations_active
    on public.blocked_locations (is_active, location_key);
