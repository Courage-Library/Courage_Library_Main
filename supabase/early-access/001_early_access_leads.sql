-- =====================================================================
-- Courage Library — Early Access / Founding Members waitlist
-- File: supabase/early-access/001_early_access_leads.sql
-- Run ONCE in: Supabase Dashboard (OLD LIVE project used by couragelibrary.in)
--              -> SQL Editor -> New query -> paste -> Run
--
-- ADDITIVE ONLY:
--   * creates 2 new tables + 1 function
--   * does NOT touch any existing table, policy or function
--
-- SECURITY MODEL:
--   * Browser can NOT read/update/delete the tables (RLS on, no policies,
--     privileges revoked).
--   * Browser can only call join_early_access(), which validates input,
--     rate-limits by IP, de-duplicates by mobile and inserts one row.
--   * You read the leads only from the Supabase Dashboard / SQL Editor.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Leads table
-- ---------------------------------------------------------------------
create table if not exists public.early_access_leads (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null
                   check (char_length(btrim(full_name)) between 2 and 80),
  mobile           text not null unique
                   check (mobile ~ '^[6-9][0-9]{9}$'),
  email            text
                   check (email is null or (char_length(email) <= 120
                          and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  target_exam      text not null
                   check (target_exam in ('SSC_CGL','SSC_CHSL','SSC_MTS','SSC_GD',
                                          'SSC_CPO','SSC_STENO','RAILWAY','BANKING',
                                          'POLICE','OTHER')),
  attempt          text not null
                   check (attempt in ('NOT_STARTED','FIRST','SECOND','THIRD_PLUS')),
  prep_mode        text not null
                   check (prep_mode in ('SELF_STUDY','COACHING','LIBRARY','ONLINE')),
  biggest_problem  text not null
                   check (biggest_problem in ('MARKS_NOT_IMPROVING','REPEAT_MISTAKES',
                                              'NO_STRATEGY','TIME_MANAGEMENT',
                                              'WEAK_SUBJECT','NO_TIME','OTHER')),
  city             text not null
                   check (char_length(btrim(city)) between 2 and 60),
  referral_code    text not null unique
                   check (referral_code ~ '^[A-F0-9]{8}$'),
  referred_by      text
                   check (referred_by is null or referred_by ~ '^[A-F0-9]{8}$'),
  utm_source       text check (utm_source   is null or char_length(utm_source)   <= 100),
  utm_medium       text check (utm_medium   is null or char_length(utm_medium)   <= 100),
  utm_campaign     text check (utm_campaign is null or char_length(utm_campaign) <= 100),
  consent          boolean not null check (consent = true),
  consent_version  text not null default 'v1',
  status           text not null default 'WAITLISTED'
                   check (status in ('WAITLISTED','INVITED','JOINED','REMOVED')),
  created_at       timestamptz not null default now()
);

create index if not exists early_access_leads_created_at_idx
  on public.early_access_leads (created_at);
create index if not exists early_access_leads_referred_by_idx
  on public.early_access_leads (referred_by);

alter table public.early_access_leads enable row level security;
-- No policies on purpose: anon/authenticated get NO direct access.
revoke all on public.early_access_leads from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Rate-limit table (hashed IP, hourly window)
-- ---------------------------------------------------------------------
create table if not exists public.early_access_rate_limits (
  ip_hash       text        not null,
  window_start  timestamptz not null,
  hits          integer     not null default 0,
  primary key (ip_hash, window_start)
);

alter table public.early_access_rate_limits enable row level security;
revoke all on public.early_access_rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. The ONLY public entry point
--    Returns JSON:
--      {status:'created', position, referral_code}
--      {status:'exists',  position, referral_code}
--      {status:'error',   code}  codes: CONSENT_REQUIRED | INVALID_MOBILE |
--                                       INVALID_INPUT | RATE_LIMITED
-- ---------------------------------------------------------------------
create or replace function public.join_early_access(
  p_full_name       text,
  p_mobile          text,
  p_email           text,
  p_target_exam     text,
  p_attempt         text,
  p_prep_mode       text,
  p_biggest_problem text,
  p_city            text,
  p_consent         boolean,
  p_referred_by     text default null,
  p_utm_source      text default null,
  p_utm_medium      text default null,
  p_utm_campaign    text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mobile   text := regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g');
  v_email    text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_ref      text := nullif(upper(btrim(coalesce(p_referred_by, ''))), '');
  v_ip       text := '';
  v_hits     integer;
  v_lead     public.early_access_leads%rowtype;
  v_code     text;
  v_tries    integer := 0;
  v_position bigint;
begin
  -- Normalise mobile: +91XXXXXXXXXX / 0XXXXXXXXXX -> XXXXXXXXXX
  if length(v_mobile) = 12 and left(v_mobile, 2) = '91' then
    v_mobile := right(v_mobile, 10);
  elsif length(v_mobile) = 11 and left(v_mobile, 1) = '0' then
    v_mobile := right(v_mobile, 10);
  end if;

  if p_consent is distinct from true then
    return json_build_object('status', 'error', 'code', 'CONSENT_REQUIRED');
  end if;

  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return json_build_object('status', 'error', 'code', 'INVALID_MOBILE');
  end if;

  -- Rate limit: max 10 calls per IP per hour (IP stored only as a hash)
  begin
    v_ip := btrim(split_part(
              coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
              ',', 1));
  exception when others then
    v_ip := '';
  end;

  if v_ip <> '' then
    insert into public.early_access_rate_limits (ip_hash, window_start, hits)
    values (md5('cl-early-access:' || v_ip), date_trunc('hour', now()), 1)
    on conflict (ip_hash, window_start)
      do update set hits = public.early_access_rate_limits.hits + 1
    returning hits into v_hits;

    delete from public.early_access_rate_limits
     where window_start < now() - interval '2 days';

    if v_hits > 10 then
      return json_build_object('status', 'error', 'code', 'RATE_LIMITED');
    end if;
  end if;

  -- Already registered? (idempotent: same mobile never creates a 2nd row)
  select * into v_lead from public.early_access_leads where mobile = v_mobile;
  if found then
    select count(*) into v_position
      from public.early_access_leads where created_at <= v_lead.created_at;
    return json_build_object('status', 'exists',
                             'position', v_position,
                             'referral_code', v_lead.referral_code);
  end if;

  -- Referral code must belong to a real lead, otherwise ignore it
  if v_ref is not null and not exists (
       select 1 from public.early_access_leads where referral_code = v_ref) then
    v_ref := null;
  end if;

  -- Insert (retry only on the rare referral_code collision)
  loop
    v_tries := v_tries + 1;
    v_code  := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    begin
      insert into public.early_access_leads (
        full_name, mobile, email, target_exam, attempt, prep_mode,
        biggest_problem, city, referral_code, referred_by,
        utm_source, utm_medium, utm_campaign, consent
      ) values (
        btrim(p_full_name), v_mobile, v_email, p_target_exam, p_attempt, p_prep_mode,
        p_biggest_problem, btrim(p_city), v_code, v_ref,
        nullif(left(btrim(coalesce(p_utm_source, '')), 100), ''),
        nullif(left(btrim(coalesce(p_utm_medium, '')), 100), ''),
        nullif(left(btrim(coalesce(p_utm_campaign, '')), 100), ''),
        true
      )
      returning * into v_lead;
      exit;
    exception
      when unique_violation then
        -- Same mobile submitted twice at the same moment
        select * into v_lead from public.early_access_leads where mobile = v_mobile;
        if found then
          select count(*) into v_position
            from public.early_access_leads where created_at <= v_lead.created_at;
          return json_build_object('status', 'exists',
                                   'position', v_position,
                                   'referral_code', v_lead.referral_code);
        end if;
        if v_tries >= 5 then
          return json_build_object('status', 'error', 'code', 'INVALID_INPUT');
        end if;
      when check_violation or not_null_violation then
        return json_build_object('status', 'error', 'code', 'INVALID_INPUT');
    end;
  end loop;

  select count(*) into v_position
    from public.early_access_leads where created_at <= v_lead.created_at;

  return json_build_object('status', 'created',
                           'position', v_position,
                           'referral_code', v_lead.referral_code);
end;
$$;

revoke all on function public.join_early_access(
  text, text, text, text, text, text, text, text, boolean, text, text, text, text
) from public;

grant execute on function public.join_early_access(
  text, text, text, text, text, text, text, text, boolean, text, text, text, text
) to anon, authenticated;

commit;
