-- Run AFTER schema.sql. Single-writer lock: only the device holding the lock can write.
create table writer_lock(id int primary key default 1 check(id=1), holder uuid, holder_name text, device text, expires_at timestamptz default now());
insert into writer_lock default values;
alter table writer_lock enable row level security;
create policy wl_sel on writer_lock for select to authenticated using(true);

create function has_lock() returns boolean language sql security definer stable set search_path=public as $$
 select is_staff() and exists(select 1 from writer_lock where holder=auth.uid() and expires_at>now()) $$;

create function claim_writer(p_device text, p_force boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare l writer_lock; me text; same boolean;
begin
 if not is_staff() then return jsonb_build_object('ok',false,'holder_name','not allowed'); end if;
 select * into l from writer_lock for update;
 select full_name into me from profiles where id=auth.uid();
 same := l.holder=auth.uid() and l.device=p_device and l.expires_at>now();
 if l.holder is null or l.expires_at<=now() or same or p_force then
  if not same then
   insert into audit_log(actor,tbl,action,row_data) values(auth.uid(),'writer_lock',
    case when p_force and l.holder is not null and l.expires_at>now() then 'TAKEOVER' else 'CLAIM' end, jsonb_build_object('device',p_device,'from',l.holder_name));
  end if;
  update writer_lock set holder=auth.uid(),holder_name=me,device=p_device,expires_at=now()+interval '2 minutes';
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'holder_name',l.holder_name);
end $$;

create function release_writer() returns void language sql security definer set search_path=public as $$
 update writer_lock set expires_at=now() where holder=auth.uid() $$;

do $$ declare t text; begin foreach t in array array['members','meals','payments','expenses','refunds','settlements'] loop
 execute format('drop policy w_%1$s on %1$s',t);
 execute format('create policy w_%1$s on %1$s for all to authenticated using(has_lock()) with check(has_lock())',t);
end loop; end $$;
drop policy w_settings on settings;
create policy w_settings on settings for update to authenticated using(is_admin() and has_lock()) with check(is_admin() and has_lock());
