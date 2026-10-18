-- Prints the PASS/FAIL report for every suite that ran before it.
select case when passed then 'PASS' else 'FAIL' end as result, name, coalesce(detail,'') as detail
from t.results where not passed or :'verbose' = '1' order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed from t.results;
