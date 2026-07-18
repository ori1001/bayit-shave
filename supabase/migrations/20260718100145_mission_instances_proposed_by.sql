alter table bayit_shave.mission_instances
  add column proposed_by uuid references bayit_shave.members(id) on delete set null;
