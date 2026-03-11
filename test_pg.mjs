// test_pg.mjs
import pg from 'pg';

const connectionString = 'postgresql://postgres.bavjpsvnhcvsmyzpsaok:-U@r2d6v8C7bFf!@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const query = `
create or replace function public.reconcile_global_location_quota_day_test(
    p_processing_day_key text,
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
    v_day_key := trim(coalesce(p_processing_day_key, ''));
    v_prefix := coalesce(p_location_prefix, 'DHARMAJAYA - ');

    if v_day_key = '' then
        raise exception 'processing_day_key is required';
    end if;

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
`;

const client = new pg.Pool({ connectionString });
async function run() {
    try {
        await client.query(query);
        console.log("Function created without syntax errors.");
    } catch (err) {
        console.error("Syntax Error:", err);
    }
    client.end();
}
run();
