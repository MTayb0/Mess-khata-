-- TYB Mess Manager schema. Run once in Supabase SQL editor.
create type app_role as enum ('admin','manager','member');
create table profiles(id uuid primary key references auth.users on delete cascade, full_name text, role app_role not null default 'member', lang text default 'en', theme jsonb default '{"mode":"light","accent":"#0f766e"}');
create table members(id uuid primary key default gen_random_uuid(), name text not null, phone text, active boolean default true, user_id uuid references auth.users);
create table meals(id uuid primary key default gen_random_uuid(), member_id uuid not null references members on delete cascade, day date not null, count numeric not null default 1, unique(member_id,day));
create table payments(id uuid primary key default gen_random_uuid(), member_id uuid not null references members on delete cascade, amount numeric not null check(amount>=0), paid_on date not null default current_date, note text);
create table expenses(id uuid primary key default gen_random_uuid(), category text, amount numeric not null check(amount>=0), spent_on date not null default current_date, note text);
create table refunds(id uuid primary key default gen_random_uuid(), member_id uuid not null references members on delete cascade, amount numeric not null check(amount>=0), refunded_on date not null default current_date, note text);
create table settlements(id uuid primary key default gen_random_uuid(), period text not null, meal_rate numeric not null, total_expense numeric, total_meals numeric, details jsonb, created_at timestamptz default now());
create table settings(id int primary key default 1 check(id=1), org_name text default 'TYB', contact text default '', currency text default '৳', rate_mode text default 'auto' check(rate_mode in ('auto','fixed')), fixed_rate numeric default 0);
insert into settings default values;
create table audit_log(id bigserial primary key, at timestamptz default now(), actor uuid, tbl text, action text, row_data jsonb);

create function is_staff() returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role in ('admin','manager')) $$;
create function is_admin() returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

create function on_signup() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email),
 case when (select count(*) from profiles)=0 then 'admin'::app_role else 'member'::app_role end); return new; end $$;
create trigger t_signup after insert on auth.users for each row execute function on_signup();

create function guard_role() returns trigger language plpgsql as $$
begin if new.role<>old.role and not is_admin() then raise exception 'Only admin can change roles'; end if; return new; end $$;
create trigger t_guard before update on profiles for each row execute function guard_role();

create function audit() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into audit_log(actor,tbl,action,row_data) values(auth.uid(),tg_table_name,tg_op,to_jsonb(coalesce(new,old))); return coalesce(new,old); end $$;
do $$ declare t text; begin foreach t in array array['members','meals','payments','expenses','refunds','settlements','settings'] loop
 execute format('create trigger a_%1$s after insert or update or delete on %1$s for each row execute function audit()',t);
 execute format('alter table %1$s enable row level security',t);
 execute format('create policy r_%1$s on %1$s for select to authenticated using(true)',t);
 execute format('create policy w_%1$s on %1$s for all to authenticated using(is_staff()) with check(is_staff())',t);
end loop; end $$;
drop policy w_settings on settings;
create policy w_settings on settings for update to authenticated using(is_admin()) with check(is_admin());

alter table profiles enable row level security;
create policy p_sel on profiles for select to authenticated using(id=auth.uid() or is_staff());
create policy p_upd on profiles for update to authenticated using(id=auth.uid() or is_admin());
alter table audit_log enable row level security;
create policy al_sel on audit_log for select to authenticated using(is_staff());
