alter table public.blocked_ktp
    add column if not exists block_type text not null default 'temporary';

create index if not exists idx_blocked_ktp_block_type
    on public.blocked_ktp (block_type);
