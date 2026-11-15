-- PostgreSQL twin of SQLite 005-vocabulary-by-unit.sql. The My Vocabulary listing reads the event log by unit (the events of the units on one page):
-- (unit_id, event_id) lets the planner take a unit's event ids from the index alone and fetch each event by its unique id.
-- (aliases_new already exists here from 001.) Additive only.
CREATE INDEX IF NOT EXISTS event_units_unit_event ON event_units (unit_id, event_id);
