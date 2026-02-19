create table if not exists public.blocked_kk (
    id bigserial primary key,
    no_kk varchar(16) not null unique,
    reason text null,
    created_at timestamptz not null default now()
);

create index if not exists idx_blocked_kk_no_kk on public.blocked_kk(no_kk);
