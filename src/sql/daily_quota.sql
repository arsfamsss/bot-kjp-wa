create table if not exists public.daily_quota_target_phones (
    phone_number text primary key,
    reason text null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.daily_quota_counters (
    scope_type text not null,
    scope_key text not null,
    processing_day_key text not null,
    used_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint daily_quota_counters_pk primary key (scope_type, scope_key, processing_day_key)
);

create index if not exists idx_daily_quota_counters_day
    on public.daily_quota_counters (processing_day_key);

alter table if exists public.bot_settings
    add column if not exists quota_enabled boolean not null default false,
    add column if not exists quota_mode text not null default 'GLOBAL',
    add column if not exists quota_daily_limit integer not null default 30;

create or replace function public.reserve_daily_quota_atomic(
    p_scope_type text,
    p_scope_key text,
    p_processing_day_key text,
    p_increment_count integer,
    p_quota_limit integer
)
returns table (
    allowed boolean,
    used_after integer,
    quota_limit integer,
    reason text
)
language plpgsql
as $$
declare
    v_used integer;
    v_increment integer := greatest(coalesce(p_increment_count, 0), 0);
    v_limit integer := greatest(coalesce(p_quota_limit, 0), 1);
begin
    if v_increment = 0 then
        return query select true, 0, v_limit, 'increment_zero'::text;
        return;
    end if;

    insert into public.daily_quota_counters (
        scope_type,
        scope_key,
        processing_day_key,
        used_count,
        created_at,
        updated_at
    )
    values (
        p_scope_type,
        p_scope_key,
        p_processing_day_key,
        0,
        now(),
        now()
    )
    on conflict (scope_type, scope_key, processing_day_key)
    do nothing;

    select used_count
    into v_used
    from public.daily_quota_counters
    where scope_type = p_scope_type
      and scope_key = p_scope_key
      and processing_day_key = p_processing_day_key
    for update;

    if v_used + v_increment > v_limit then
        return query select false, v_used, v_limit, 'quota_full'::text;
        return;
    end if;

    update public.daily_quota_counters
    set used_count = v_used + v_increment,
        updated_at = now()
    where scope_type = p_scope_type
      and scope_key = p_scope_key
      and processing_day_key = p_processing_day_key;

    return query select true, v_used + v_increment, v_limit, 'quota_reserved'::text;
end;
$$;

create or replace function public.release_daily_quota_atomic(
    p_scope_type text,
    p_scope_key text,
    p_processing_day_key text,
    p_decrement_count integer
)
returns table (
    used_after integer,
    reason text
)
language plpgsql
as $$
declare
    v_used integer;
    v_decrement integer := greatest(coalesce(p_decrement_count, 0), 0);
begin
    if v_decrement = 0 then
        return query select 0, 'decrement_zero'::text;
        return;
    end if;

    insert into public.daily_quota_counters (
        scope_type,
        scope_key,
        processing_day_key,
        used_count,
        created_at,
        updated_at
    )
    values (
        p_scope_type,
        p_scope_key,
        p_processing_day_key,
        0,
        now(),
        now()
    )
    on conflict (scope_type, scope_key, processing_day_key)
    do nothing;

    select used_count
    into v_used
    from public.daily_quota_counters
    where scope_type = p_scope_type
      and scope_key = p_scope_key
      and processing_day_key = p_processing_day_key
    for update;

    update public.daily_quota_counters
    set used_count = greatest(v_used - v_decrement, 0),
        updated_at = now()
    where scope_type = p_scope_type
      and scope_key = p_scope_key
      and processing_day_key = p_processing_day_key;

    return query select greatest(v_used - v_decrement, 0), 'quota_released'::text;
end;
$$;
