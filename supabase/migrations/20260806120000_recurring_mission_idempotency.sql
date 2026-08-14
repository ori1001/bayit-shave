-- Recurring generation must be safe to re-run: the spec requires the balance
-- run be re-triggerable after a partial failure, and generation happens on the
-- same path. Without this index a retry silently creates a second copy of every
-- recurring chore for the same day.
--
-- Partial on template_id so one-off missions (template_id is null) are
-- unaffected -- they are free to share a due_date.
create unique index if not exists mission_instances_template_due_date_uniq
  on bayit_shave.mission_instances (template_id, due_date)
  where template_id is not null;
