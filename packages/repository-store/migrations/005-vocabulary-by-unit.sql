-- The My Vocabulary listing reads the event log BY UNIT (the events of the 100 units on a page), never by learner.
-- (unit_id, event_id) is a covering index for that: the unit's event ids come straight from the index and each event is then fetched by its unique id.
-- aliases had no index on new_id (the PostgreSQL schema has had aliases_new from the start), so aliasesTo() scanned the table.
-- Additive only: IF NOT EXISTS, nothing dropped or changed.
CREATE INDEX IF NOT EXISTS event_units_unit_event ON event_units (unit_id, event_id);
CREATE INDEX IF NOT EXISTS aliases_new ON aliases (new_id);
