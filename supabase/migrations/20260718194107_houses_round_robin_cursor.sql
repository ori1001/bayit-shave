alter table bayit_shave.houses
  add column round_robin_cursor uuid references bayit_shave.members(id) on delete set null;
