begin;

drop function if exists public.apply_global_location_quota_delta(text, text, integer);

create or replace function public.apply_global_location_quota_delta(
    p_processing_day_key text,
    p_location_key text,
    p_delta integer
)
returns table (
    out_location_key text,
    out_processing_day_key text,
    out_used_before integer,
    out_used_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_day_key text;
    v_location_key text;
    v_delta integer;
    v_current integer;
    v_next integer;
begin
    v_day_key := trim(coalesce(p_processing_day_key, ''));
    v_location_key := regexp_replace(trim(coalesce(p_location_key, '')), '\\s+', ' ', 'g');
    v_delta := coalesce(p_delta, 0);

    if v_day_key = '' then
        raise exception 'processing_day_key is required';
    end if;

    if v_location_key = '' then
        raise exception 'location_key is required';
    end if;

    insert into public.location_global_quota_usage (
        processing_day_key,
        location_key,
        used_count,
        updated_at
    ) values (
        v_day_key,
        v_location_key,
        0,
        now()
    )
    on conflict on constraint location_global_quota_usage_pkey
    do nothing;

    select used_count
      into v_current
      from public.location_global_quota_usage
     where public.location_global_quota_usage.processing_day_key = v_day_key
       and public.location_global_quota_usage.location_key = v_location_key
     for update;

    v_current := coalesce(v_current, 0);
    v_next := greatest(0, v_current + v_delta);

    update public.location_global_quota_usage
       set used_count = v_next,
           updated_at = now()
     where public.location_global_quota_usage.processing_day_key = v_day_key
       and public.location_global_quota_usage.location_key = v_location_key;

    return query
    select
        v_location_key as out_location_key,
        v_day_key as out_processing_day_key,
        v_current as out_used_before,
        v_next as out_used_after;
end;
$$;

drop function if exists public.reconcile_global_location_quota_day(text, text);

create or replace function public.reconcile_global_location_quota_day(
    p_proc_day text,
    p_location_prefix text default 'DHARMAJAYA - '
)
returns table (
    out_processing_day_key text,
    out_location_key text,
    out_used_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_day_key text;
    v_prefix text;
    target_row record;
begin
    v_day_key := trim(coalesce(p_proc_day, ''));
    v_prefix := coalesce(p_location_prefix, 'DHARMAJAYA - ');

    if v_day_key = '' then
        raise exception 'processing_day_key is required';
    end if;

    -- CTE


    with counts as (
        select
            dh.processing_day_key::text as day_key,
            regexp_replace(trim(dh.lokasi), '\\s+', ' ', 'g') as location_key,
            count(*)::integer as used_after
        from public.data_harian dh
        where dh.processing_day_key::text = v_day_key
          and dh.lokasi like (v_prefix || '%')
        group by dh.processing_day_key::text, regexp_replace(trim(dh.lokasi), '\\s+', ' ', 'g')
    )
    insert into public.location_global_quota_usage (
        processing_day_key,
        location_key,
        used_count,
        updated_at
    )
    select
        c.day_key,
        c.location_key,
        c.used_after,
        now()
    from counts c
    on conflict on constraint location_global_quota_usage_pkey
    do update set
        used_count = excluded.used_count,
        updated_at = now();

    update public.location_global_quota_usage u
       set used_count = 0,
           updated_at = now()
     where u.processing_day_key = v_day_key
       and u.location_key like (v_prefix || '%')
       and not exists (
           select 1
             from public.data_harian dh
            where dh.processing_day_key::text = v_day_key
              and regexp_replace(trim(dh.lokasi), '\\s+', ' ', 'g') = u.location_key
       );

    for target_row in
        select
            u.processing_day_key,
            u.location_key,
            u.used_count
        from public.location_global_quota_usage u
        where u.processing_day_key = v_day_key
          and u.location_key like (v_prefix || '%')
        order by u.location_key
    loop
        out_processing_day_key := target_row.processing_day_key;
        out_location_key := target_row.location_key;
        out_used_after := target_row.used_count;
        return next;
    end loop;
end;
$$;

revoke all on function public.apply_global_location_quota_delta(text, text, integer) from public;
revoke all on function public.reconcile_global_location_quota_day(text, text) from public;

grant execute on function public.apply_global_location_quota_delta(text, text, integer)
    to anon, authenticated, service_role;

grant execute on function public.reconcile_global_location_quota_day(text, text)
    to authenticated, service_role;

commit;
