-- Nous 内测数据存储：追加式快照表
-- 在 Supabase SQL Editor 里整段执行一次即可

create table if not exists snapshots (
  id bigint generated always as identity primary key,
  code text not null,                -- 被试邀请码（= 身份）
  kind text not null,                -- interview / scores / final_submit
  payload jsonb not null,            -- 完整快照，追加不覆盖
  created_at timestamptz not null default now()
);

create index if not exists snapshots_code_kind_idx
  on snapshots (code, kind, created_at desc);

-- 拒绝一切匿名/公开访问：只有持 service_role key 的服务端能读写。
-- （开启 RLS 且不建任何 policy = anon key 全部被拒；service key 天然绕过 RLS）
alter table snapshots enable row level security;
