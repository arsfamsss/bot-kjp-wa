create table if not exists public.location_schedules (
    id uuid default gen_random_uuid() primary key,
    provider text not null,
    sub_location text,
    action text not null,
    schedule_type text not null,
    scheduled_time timestamptz not null,
    recurring_time time,
    reason text,
    is_active boolean not null default true,
    last_executed_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists idx_schedules_active on public.location_schedules (is_active, schedule_type);
create index if not exists idx_schedules_provider on public.location_schedules (provider);
