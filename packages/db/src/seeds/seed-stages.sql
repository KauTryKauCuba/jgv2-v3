-- Seed stages data
INSERT INTO stages (id, name, slug, description) VALUES
(1, 'received', 'received', 'Application has been received'),
(2, 'screened', 'screened', 'Application has been screened'),
(3, 'shortlisted', 'shortlisted', 'Applicant has been shortlisted'),
(4, 'in_progress', 'in_progress', 'Interview is in progress (pending, scheduled, declined, rejected, or absent)'),
(5, 'interviewed', 'interviewed', 'Interview completed'),
(6, 'kiv', 'kiv', 'Application has been kept in view'),
(7, 'passed', 'passed', 'Applicant passed the interview'),
(8, 'rejected', 'rejected', 'Application rejected');
