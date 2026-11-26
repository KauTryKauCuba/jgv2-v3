-- REQ-003 §6.1 / FR-LANG-001 — idempotent language catalog (D1 source of truth).
-- Apply: bun run seed:languages:local | seed:languages (Worker) | wrangler d1 execute --file=...

UPDATE `languages` SET `iso6393` = NULL
WHERE `iso6393` IN ('por', 'rus', 'spa', 'urd', 'vie');
--> statement-breakpoint
UPDATE `languages` SET `iso6393` = NULL
WHERE `iso6393` IS NOT NULL
  AND `iso6393` NOT IN (
    'ara','bdr','ben','bth','zho','eng','fil','fra','deu','hin','iba','ind',
    'jpn','dtp','kor','msa','mal','mel','pan','tam','tel','tha'
  );
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Arabic', `iso6393` = 'ara' WHERE `iso6393` = 'ara';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Arabic', `iso6393` = 'ara' WHERE `name` = 'Arabic' AND (`iso6393` IS NULL OR `iso6393` = 'ara');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Arabic', 'ara'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'ara' OR `name` = 'Arabic');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Bajau', `iso6393` = 'bdr' WHERE `iso6393` = 'bdr';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Bajau', `iso6393` = 'bdr' WHERE `name` = 'Bajau' AND (`iso6393` IS NULL OR `iso6393` = 'bdr');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Bajau', 'bdr'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'bdr' OR `name` = 'Bajau');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Bengali', `iso6393` = 'ben' WHERE `iso6393` = 'ben';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Bengali', `iso6393` = 'ben' WHERE `name` = 'Bengali' AND (`iso6393` IS NULL OR `iso6393` = 'ben');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Bengali', 'ben'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'ben' OR `name` = 'Bengali');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Bidayuh', `iso6393` = 'bth' WHERE `iso6393` = 'bth';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Bidayuh', `iso6393` = 'bth' WHERE `name` = 'Bidayuh' AND (`iso6393` IS NULL OR `iso6393` = 'bth');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Bidayuh', 'bth'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'bth' OR `name` = 'Bidayuh');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Chinese', `iso6393` = 'zho' WHERE `iso6393` = 'zho';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Chinese', `iso6393` = 'zho' WHERE `name` = 'Chinese' AND (`iso6393` IS NULL OR `iso6393` = 'zho');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Chinese', 'zho'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'zho' OR `name` = 'Chinese');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'English', `iso6393` = 'eng' WHERE `iso6393` = 'eng';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'English', `iso6393` = 'eng' WHERE `name` = 'English' AND (`iso6393` IS NULL OR `iso6393` = 'eng');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'English', 'eng'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'eng' OR `name` = 'English');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Filipino', `iso6393` = 'fil' WHERE `iso6393` = 'fil';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Filipino', `iso6393` = 'fil' WHERE `name` = 'Filipino' AND (`iso6393` IS NULL OR `iso6393` = 'fil');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Filipino', 'fil'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'fil' OR `name` = 'Filipino');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'French', `iso6393` = 'fra' WHERE `iso6393` = 'fra';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'French', `iso6393` = 'fra' WHERE `name` = 'French' AND (`iso6393` IS NULL OR `iso6393` = 'fra');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'French', 'fra'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'fra' OR `name` = 'French');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'German', `iso6393` = 'deu' WHERE `iso6393` = 'deu';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'German', `iso6393` = 'deu' WHERE `name` = 'German' AND (`iso6393` IS NULL OR `iso6393` = 'deu');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'German', 'deu'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'deu' OR `name` = 'German');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Hindi', `iso6393` = 'hin' WHERE `iso6393` = 'hin';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Hindi', `iso6393` = 'hin' WHERE `name` = 'Hindi' AND (`iso6393` IS NULL OR `iso6393` = 'hin');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Hindi', 'hin'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'hin' OR `name` = 'Hindi');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Iban', `iso6393` = 'iba' WHERE `iso6393` = 'iba';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Iban', `iso6393` = 'iba' WHERE `name` = 'Iban' AND (`iso6393` IS NULL OR `iso6393` = 'iba');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Iban', 'iba'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'iba' OR `name` = 'Iban');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Indonesian', `iso6393` = 'ind' WHERE `iso6393` = 'ind';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Indonesian', `iso6393` = 'ind' WHERE `name` = 'Indonesian' AND (`iso6393` IS NULL OR `iso6393` = 'ind');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Indonesian', 'ind'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'ind' OR `name` = 'Indonesian');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Japanese', `iso6393` = 'jpn' WHERE `iso6393` = 'jpn';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Japanese', `iso6393` = 'jpn' WHERE `name` = 'Japanese' AND (`iso6393` IS NULL OR `iso6393` = 'jpn');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Japanese', 'jpn'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'jpn' OR `name` = 'Japanese');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Kadazan Dusun', `iso6393` = 'dtp' WHERE `iso6393` = 'dtp';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Kadazan Dusun', `iso6393` = 'dtp' WHERE `name` = 'Kadazan Dusun' AND (`iso6393` IS NULL OR `iso6393` = 'dtp');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Kadazan Dusun', 'dtp'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'dtp' OR `name` = 'Kadazan Dusun');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Korean', `iso6393` = 'kor' WHERE `iso6393` = 'kor';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Korean', `iso6393` = 'kor' WHERE `name` = 'Korean' AND (`iso6393` IS NULL OR `iso6393` = 'kor');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Korean', 'kor'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'kor' OR `name` = 'Korean');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Malay', `iso6393` = 'msa' WHERE `iso6393` = 'msa';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Malay', `iso6393` = 'msa' WHERE `name` = 'Malay' AND (`iso6393` IS NULL OR `iso6393` = 'msa');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Malay', 'msa'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'msa' OR `name` = 'Malay');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Malayalam', `iso6393` = 'mal' WHERE `iso6393` = 'mal';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Malayalam', `iso6393` = 'mal' WHERE `name` = 'Malayalam' AND (`iso6393` IS NULL OR `iso6393` = 'mal');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Malayalam', 'mal'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'mal' OR `name` = 'Malayalam');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Melanau', `iso6393` = 'mel' WHERE `iso6393` = 'mel';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Melanau', `iso6393` = 'mel' WHERE `name` = 'Melanau' AND (`iso6393` IS NULL OR `iso6393` = 'mel');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Melanau', 'mel'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'mel' OR `name` = 'Melanau');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Punjabi', `iso6393` = 'pan' WHERE `iso6393` = 'pan';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Punjabi', `iso6393` = 'pan' WHERE `name` = 'Punjabi' AND (`iso6393` IS NULL OR `iso6393` = 'pan');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Punjabi', 'pan'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'pan' OR `name` = 'Punjabi');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Tamil', `iso6393` = 'tam' WHERE `iso6393` = 'tam';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Tamil', `iso6393` = 'tam' WHERE `name` = 'Tamil' AND (`iso6393` IS NULL OR `iso6393` = 'tam');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Tamil', 'tam'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'tam' OR `name` = 'Tamil');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Telugu', `iso6393` = 'tel' WHERE `iso6393` = 'tel';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Telugu', `iso6393` = 'tel' WHERE `name` = 'Telugu' AND (`iso6393` IS NULL OR `iso6393` = 'tel');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Telugu', 'tel'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'tel' OR `name` = 'Telugu');
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Thai', `iso6393` = 'tha' WHERE `iso6393` = 'tha';
--> statement-breakpoint
UPDATE `languages` SET `name` = 'Thai', `iso6393` = 'tha' WHERE `name` = 'Thai' AND (`iso6393` IS NULL OR `iso6393` = 'tha');
--> statement-breakpoint
INSERT INTO `languages` (`name`, `iso6393`)
SELECT 'Thai', 'tha'
WHERE NOT EXISTS (SELECT 1 FROM `languages` WHERE `iso6393` = 'tha' OR `name` = 'Thai');
--> statement-breakpoint
DELETE FROM `language_varieties`
WHERE `language_id` IN (
  SELECT `id` FROM `languages` WHERE `iso6393` IS NOT NULL AND `iso6393` NOT IN ('zho', 'msa')
);
--> statement-breakpoint
DELETE FROM `language_varieties`
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1)
  AND `name` NOT IN (
    'Mandarin', 'Hokkien', 'Hakka', 'Cantonese', 'Teochew', 'Hainanese', 'Foochow'
  );
--> statement-breakpoint
DELETE FROM `language_varieties`
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1)
  AND `name` NOT IN (
    'Standard Malay', 'Kedah Malay', 'Kelantan Malay', 'Terengganu Malay', 'Perak Malay',
    'Pahang Malay', 'Negeri Sembilan Malay', 'Sarawak Malay', 'Sabah Malay',
    'Brunei Malay', 'Baba Malay'
  );
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Mandarin', 'cmn' FROM `languages` l WHERE l.`iso6393` = 'zho'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Mandarin'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'cmn'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1) AND `name` = 'Mandarin';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Hokkien', 'nan' FROM `languages` l WHERE l.`iso6393` = 'zho'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Hokkien'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'nan'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1) AND `name` = 'Hokkien';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Hakka', 'hak' FROM `languages` l WHERE l.`iso6393` = 'zho'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Hakka'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'hak'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1) AND `name` = 'Hakka';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Cantonese', 'yue' FROM `languages` l WHERE l.`iso6393` = 'zho'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Cantonese'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'yue'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1) AND `name` = 'Cantonese';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Teochew', 'nan-teo' FROM `languages` l WHERE l.`iso6393` = 'zho'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Teochew'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'nan-teo'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1) AND `name` = 'Teochew';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Hainanese', 'hnm' FROM `languages` l WHERE l.`iso6393` = 'zho'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Hainanese'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'hnm'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1) AND `name` = 'Hainanese';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Foochow', 'cdo' FROM `languages` l WHERE l.`iso6393` = 'zho'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Foochow'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'cdo'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'zho' LIMIT 1) AND `name` = 'Foochow';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Standard Malay', 'zsm' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Standard Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'zsm'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Standard Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Kedah Malay', 'meo' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Kedah Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'meo'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Kedah Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Kelantan Malay', 'mfa' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Kelantan Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'mfa'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Kelantan Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Terengganu Malay', 'trg' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Terengganu Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'trg'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Terengganu Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Perak Malay', 'prk' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Perak Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'prk'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Perak Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Pahang Malay', 'phg' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Pahang Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'phg'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Pahang Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Negeri Sembilan Malay', 'zmi' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Negeri Sembilan Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'zmi'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Negeri Sembilan Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Sarawak Malay', 'swk' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Sarawak Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'swk'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Sarawak Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Sabah Malay', 'msi' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Sabah Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'msi'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Sabah Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Brunei Malay', 'kxd' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Brunei Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'kxd'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Brunei Malay';
--> statement-breakpoint
INSERT INTO `language_varieties` (`language_id`, `name`, `iso6393`)
SELECT l.`id`, 'Baba Malay', 'mbf' FROM `languages` l WHERE l.`iso6393` = 'msa'
AND NOT EXISTS (
  SELECT 1 FROM `language_varieties` v WHERE v.`language_id` = l.`id` AND v.`name` = 'Baba Malay'
);
--> statement-breakpoint
UPDATE `language_varieties` SET `iso6393` = 'mbf'
WHERE `language_id` = (SELECT `id` FROM `languages` WHERE `iso6393` = 'msa' LIMIT 1) AND `name` = 'Baba Malay';
