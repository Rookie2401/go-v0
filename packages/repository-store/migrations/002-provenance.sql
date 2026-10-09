-- Go Repository store, migration 002: provenance columns (contract v3, audit P-12). NEVER edit this file once it has been applied anywhere.
--
-- The shared linguistic tables (units, relations, analyses) keep their full row as JSON; contract v3 adds `provenance.origin` and
-- `provenance.validation` to that JSON. These two columns copy them out so that "how many rows came from a learner's lookup, and how many of
-- those are unreviewed?" is an indexed query rather than a scan. A row written before v3 has neither field in its JSON and reads as
-- origin 'import' / validation 'unreviewed', which is also the column default. For an analysis the value is read from the analysis' own
-- provenance when it has one, else from its chosen (or first) candidate, the same rule as `provenanceColumns` in the contract.

ALTER TABLE units ADD COLUMN origin TEXT NOT NULL DEFAULT 'import';
ALTER TABLE units ADD COLUMN validation TEXT NOT NULL DEFAULT 'unreviewed';
UPDATE units SET
  origin     = COALESCE(json_extract(json, '$.provenance.origin'), 'import'),
  validation = COALESCE(json_extract(json, '$.provenance.validation'), 'unreviewed');
CREATE INDEX units_origin ON units (origin, validation);

ALTER TABLE relations ADD COLUMN origin TEXT NOT NULL DEFAULT 'import';
ALTER TABLE relations ADD COLUMN validation TEXT NOT NULL DEFAULT 'unreviewed';
UPDATE relations SET
  origin     = COALESCE(json_extract(json, '$.provenance.origin'), 'import'),
  validation = COALESCE(json_extract(json, '$.provenance.validation'), 'unreviewed');
CREATE INDEX relations_origin ON relations (origin, validation);

ALTER TABLE analyses ADD COLUMN origin TEXT NOT NULL DEFAULT 'import';
ALTER TABLE analyses ADD COLUMN validation TEXT NOT NULL DEFAULT 'unreviewed';
UPDATE analyses SET
  origin = CASE WHEN json_type(json, '$.provenance') = 'object'
    THEN COALESCE(json_extract(json, '$.provenance.origin'), 'import')
    ELSE COALESCE(json_extract(json, '$.candidates[' || COALESCE(json_extract(json, '$.chosen'), 0) || '].provenance.origin'), 'import') END,
  validation = CASE WHEN json_type(json, '$.provenance') = 'object'
    THEN COALESCE(json_extract(json, '$.provenance.validation'), 'unreviewed')
    ELSE COALESCE(json_extract(json, '$.candidates[' || COALESCE(json_extract(json, '$.chosen'), 0) || '].provenance.validation'), 'unreviewed') END;
CREATE INDEX analyses_origin ON analyses (origin, validation);
