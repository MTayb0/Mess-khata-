-- Run AFTER schema.sql and writer_lock.sql. Username login, approval gate, admin PIN reset.
alter table profiles add column username text unique;
alter table profiles add column approved boolean not null default false;
update profiles set approved=true;

create or replace function on_signup() returns trigger language plpgsql security definer set search_path=public as $$
declare first boolean;
begin first := (select count(*) from profiles)=0;
 insert into profiles(id,full_name,username,role,approved) values(new.id,
  coalesce(new.raw_user_meta_data->>'full_name',new.email), new.raw_user_meta_data->>'username',
  case when first then 'admin'::app_role else 'member'::app_role end, first);
 return new; end $$;

create or replace function guard_role() returns trigger language plpgsql as $$
begin if (new.role<>old.role or new.approved<>old.approved or new.username is distinct from old.username) and not is_admin()
 then raise exception 'Only admin can change this'; end if; return new; end $$;

create function is_approved() returns boolean language sql security definer stable set search_path=public as $$
 select exists(select 1 from profiles where id=auth.uid() and approved) $$;
create function admin_exists() returns boolean language sql security definer stable set search_path=public as $$
 select exists(select 1 from profiles where role='admin') $$;
grant execute on function admin_exists() to anon, authenticated;

do $$ declare t text; begin foreach t in array array['members','meals','payments','expenses','refunds','settlements','settings'] loop
 execute format('drop policy r_%1$s on %1$s',t);
 execute format('create policy r_%1$s on %1$s for select to authenticated using(is_approved())',t);
end loop; end $$;

create function admin_set_pin(p_user uuid, p_pw text) returns void language plpgsql security definer set search_path=public,extensions as $$
begin if not is_admin() then raise exception 'Only admin'; end if;
 update auth.users set encrypted_password=crypt(p_pw,gen_salt('bf')) where id=p_user; end $$;
