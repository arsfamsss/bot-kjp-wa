begin;

drop function if exists public.release_daily_quota_atomic(text, text, text, integer);
drop function if exists public.reserve_daily_quota_atomic(text, text, text, integer, integer);
drop table if exists public.daily_quota_target_phones;
drop table if exists public.daily_quota_counters;

alter table if exists public.bot_settings
    drop column if exists quota_enabled,
    drop column if exists quota_mode,
    drop column if exists quota_daily_limit;

create table if not exists public.location_daily_limits (
    location_key text primary key,
    daily_limit integer not null check (daily_limit >= 0),
    is_active boolean not null default true,
    updated_by text,
    updated_at timestamptz not null default now()
);

create table if not exists public.location_user_daily_counters (
    processing_day_key text not null,
    location_key text not null,
    sender_phone text not null,
    used_count integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (processing_day_key, location_key, sender_phone)
);

create index if not exists idx_location_user_daily_counters_location
    on public.location_user_daily_counters (location_key);

create or replace function public.reserve_location_user_quota_atomic(
    p_processing_day_key text,
    p_location_key text,
    p_sender_phone text,
    p_increment_count integer
)
returns table (
    allowed boolean,
    used_after integer,
    limit_value integer,
    reason text
)
language plpgsql
security definer
as $$
declare
    v_limit integer;
    v_active boolean;
    v_current integer;
begin
    if p_increment_count is null or p_increment_count < 0 then
        return query select false, 0, 0, 'invalid_increment';
        return;
    end if;

    select daily_limit, is_active
      into v_limit, v_active
      from public.location_daily_limits
     where location_key = p_location_key
     limit 1;

    if v_limit is null or v_active is false then
        return query select true, 0, 0, 'limit_not_active';
        return;
    end if;

    insert into public.location_user_daily_counters (
        processing_day_key, location_key, sender_phone, used_count, updated_at
    ) values (
        p_processing_day_key, p_location_key, p_sender_phone, 0, now()
    )
    on conflict (processing_day_key, location_key, sender_phone)
    do nothing;

    select used_count
      into v_current
      from public.location_user_daily_counters
     where processing_day_key = p_processing_day_key
       and location_key = p_location_key
       and sender_phone = p_sender_phone
     for update;

    if p_increment_count = 0 then
        return query select true, coalesce(v_current, 0), v_limit, 'increment_zero';
        return;
    end if;

    if coalesce(v_current, 0) + p_increment_count > v_limit then
        return query select false, coalesce(v_current, 0), v_limit, 'quota_exceeded';
        return;
    end if;

    update public.location_user_daily_counters
       set used_count = coalesce(v_current, 0) + p_increment_count,
           updated_at = now()
     where processing_day_key = p_processing_day_key
       and location_key = p_location_key
       and sender_phone = p_sender_phone;

    return query select true, coalesce(v_current, 0) + p_increment_count, v_limit, 'reserved';
end;
$$;

grant execute on function public.reserve_location_user_quota_atomic(text, text, text, integer) to anon, authenticated, service_role;

commit;
