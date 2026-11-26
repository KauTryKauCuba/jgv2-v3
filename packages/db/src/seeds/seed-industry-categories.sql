-- Seed industry categories data (reseeds: clears then inserts)
-- Null FKs so DELETE succeeds; ids 1–22 match seed-industries.sql category_id references.
UPDATE industries SET category_id = NULL;
DELETE FROM industry_categories;

INSERT INTO industry_categories (id, name) VALUES
(1, 'Business'),
(2, 'Finance'),
(3, 'Advertising & Media'),
(4, 'Non-Profit'),
(5, 'Agriculture & Environment'),
(6, 'Information Technology'),
(7, 'Transport & Logistics'),
(8, 'Consumer Products'),
(9, 'Real Estate'),
(10, 'Construction & Engineering'),
(11, 'Manufacturing & Industrial'),
(12, 'Web 3.0'),
(13, 'Service/Retail Housing/Maintenance'),
(14, 'Healthcare'),
(15, 'Security Activities'),
(16, 'Education'),
(17, 'Energy & Utilities'),
(18, 'Sport & Recreation'),
(19, 'Hospitality & Tourism'),
(20, 'Human Resources'),
(21, 'Legal'),
(22, 'Miscellaneous');
