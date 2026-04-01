create table if not exists public.blocked_kjp (
    id bigserial primary key,
    no_kjp text not null,
    reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists blocked_kjp_no_kjp_idx
    on public.blocked_kjp (no_kjp);

create index if not exists blocked_kjp_created_at_idx
    on public.blocked_kjp (created_at desc);

create or replace function public.set_blocked_kjp_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_blocked_kjp_updated_at on public.blocked_kjp;
create trigger trg_blocked_kjp_updated_at
before update on public.blocked_kjp
for each row
execute function public.set_blocked_kjp_updated_at();
