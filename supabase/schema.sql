-- Run once in the SQL editor of a new Supabase project.
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  round integer not null default 1,
  winner_id uuid,
  winner_name text,
  revision integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 20),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create unique index players_unique_nickname on public.players(room_id, lower(nickname));
alter table public.rooms enable row level security;
alter table public.players enable row level security;

create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.players where room_id = p_room and user_id = auth.uid());
$$;
create policy room_members_read on public.rooms for select to authenticated using (public.is_room_member(id));
create policy player_members_read on public.players for select to authenticated using (public.is_room_member(room_id));
-- All writes go through checked functions. No client can directly choose a winner.
revoke all on public.rooms, public.players from anon, authenticated;
grant select on public.rooms, public.players to authenticated;

create function public.create_room(p_nickname text) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; candidate text;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 20 then raise exception 'Choisis un pseudo de 1 à 20 caractères.'; end if;
  if (select count(*) from public.rooms where host_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then raise exception 'Trop de rooms créées. Réessaie plus tard.'; end if;
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    insert into public.rooms(code, host_id) values(candidate, auth.uid()) on conflict(code) do nothing returning * into r;
    exit when r.id is not null;
  end loop;
  insert into public.players(room_id, user_id, nickname) values(r.id, auth.uid(), btrim(p_nickname));
  return r;
end;
$$;
create function public.join_room(p_code text, p_nickname text) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 20 then raise exception 'Choisis un pseudo de 1 à 20 caractères.'; end if;
  select * into r from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'Cette room est introuvable. Vérifie le code.'; end if;
  if exists(select 1 from public.players where room_id = r.id and lower(nickname) = lower(btrim(p_nickname)) and user_id <> auth.uid()) then raise exception 'Ce pseudo est déjà pris dans cette room.'; end if;
  if (select count(*) from public.players where room_id = r.id) >= 50 and not public.is_room_member(r.id) then raise exception 'Cette room est complète (50 joueurs).'; end if;
  insert into public.players(room_id, user_id, nickname) values(r.id, auth.uid(), btrim(p_nickname))
    on conflict(room_id,user_id) do update set nickname = excluded.nickname;
  return r;
end;
$$;
create function public.buzz(p_room uuid, p_round integer) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; player_name text;
begin
  -- Lock shared by buzz/reset: exactly one transaction can claim a round.
  select * into r from public.rooms where id = p_room for update;
  if not found or not public.is_room_member(p_room) then raise exception 'Rejoins la room pour buzzer.'; end if;
  if p_round is distinct from r.round then raise exception 'La manche a changé. Buzze à nouveau.'; end if;
  if r.winner_id is null then
    select nickname into player_name from public.players where room_id = p_room and user_id = auth.uid();
    update public.rooms set winner_id = auth.uid(), winner_name = player_name, revision = revision + 1 where id = p_room returning * into r;
  end if;
  return r;
end;
$$;
create function public.reset_round(p_room uuid, p_round integer) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found or auth.uid() is distinct from r.host_id then raise exception 'Seul l’hôte peut relancer la manche.'; end if;
  if p_round is distinct from r.round then return r; end if;
  if r.winner_id is null then raise exception 'Attends le premier buzz avant de relancer.'; end if;
  update public.rooms set round = round + 1, winner_id = null, winner_name = null, revision = revision + 1 where id = p_room returning * into r;
  return r;
end;
$$;
revoke all on function public.is_room_member(uuid), public.create_room(text), public.join_room(text,text), public.buzz(uuid,integer), public.reset_round(uuid,integer) from public, anon;
grant execute on function public.is_room_member(uuid), public.create_room(text), public.join_room(text,text), public.buzz(uuid,integer), public.reset_round(uuid,integer) to authenticated;

alter publication supabase_realtime add table public.rooms, public.players;
