-- =====================================================================
-- Courage Library — Early Access: admin queries (read-only helpers)
-- Run these in Supabase Dashboard -> SQL Editor whenever you need them.
-- Nothing here changes the schema.
-- =====================================================================

-- 1) Total signups + today
select count(*)                                            as total_signups,
       count(*) filter (where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
                                                            as today_ist
from public.early_access_leads;

-- 2) Signups per day (IST)
select (created_at at time zone 'Asia/Kolkata')::date as day_ist, count(*)
from public.early_access_leads
group by 1 order by 1 desc;

-- 3) Where are they coming from? (UTM source)
select coalesce(utm_source, '(direct)') as source, count(*)
from public.early_access_leads
group by 1 order by 2 desc;

-- 4) Know your users: exam / attempt / problem
select target_exam, count(*) from public.early_access_leads group by 1 order by 2 desc;
select attempt, count(*) from public.early_access_leads group by 1 order by 2 desc;
select biggest_problem, count(*) from public.early_access_leads group by 1 order by 2 desc;
select initcap(city) as city, count(*) from public.early_access_leads group by 1 order by 2 desc limit 20;

-- 5) Referral leaderboard (who brought the most friends)
select l.full_name, l.mobile, l.referral_code, count(r.id) as referrals
from public.early_access_leads l
left join public.early_access_leads r on r.referred_by = l.referral_code
group by l.id
order by referrals desc, l.created_at asc
limit 50;

-- 6) Invite list for the next wave (top referrers first, then earliest)
select l.id, l.full_name, l.mobile, l.email, l.target_exam, l.city,
       count(r.id) as referrals, l.created_at
from public.early_access_leads l
left join public.early_access_leads r on r.referred_by = l.referral_code
where l.status = 'WAITLISTED'
group by l.id
order by referrals desc, l.created_at asc
limit 100;

-- 7) Mark a wave as INVITED (edit the limit, run AFTER reviewing query 6)
-- update public.early_access_leads set status = 'INVITED'
-- where id in (
--   select l.id from public.early_access_leads l
--   left join public.early_access_leads r on r.referred_by = l.referral_code
--   where l.status = 'WAITLISTED'
--   group by l.id order by count(r.id) desc, l.created_at asc
--   limit 100
-- );

-- 8) Export: Table Editor -> early_access_leads -> "Export to CSV"
