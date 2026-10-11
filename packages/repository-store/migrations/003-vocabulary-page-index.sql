-- Stable, bounded My Vocabulary pagination by learner, language and unit id.
CREATE INDEX knowledge_vocabulary_page ON knowledge (learner_id, language_id, unit_id);
CREATE INDEX knowledge_vocabulary_counts ON knowledge (learner_id, language_id, json_extract(json, '$.encounters'), json_extract(json, '$.level'));
CREATE INDEX events_card_review ON events (learner_id, language_id, json_extract(json, '$.subject.cardId'), seq);
