-- The previous migration made this index partial (WHERE template_id is not
-- null). Postgres will only use a partial index to resolve ON CONFLICT if the
-- statement repeats the same predicate, and PostgREST's upsert cannot express
-- one -- so the generation insert failed outright with "no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- A plain unique index resolves that and still leaves one-off missions alone:
-- their template_id is null, and Postgres treats nulls as distinct by default,
-- so (null, date) never conflicts with another (null, date).
drop index if exists bayit_shave.mission_instances_template_due_date_uniq;

create unique index if not exists mission_instances_template_due_date_uniq
  on bayit_shave.mission_instances (template_id, due_date);
