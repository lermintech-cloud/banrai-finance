-- Annual project budget plan: each project records which work group runs it, who is responsible
-- and when it runs, so the plan can be printed as one table of all projects for the year.
ALTER TABLE projects ADD COLUMN department  TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN owner_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN period_text TEXT NOT NULL DEFAULT '';
