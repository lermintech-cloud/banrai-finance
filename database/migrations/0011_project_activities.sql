-- Activities inside a project: each has its own budget, and an expense request may name one,
-- so the school can see how much each activity has used. Deleting a project removes its activities.
CREATE TABLE IF NOT EXISTS project_activities (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity_name        TEXT NOT NULL CHECK (length(trim(activity_name)) > 0),
  budget_amount_satang INTEGER NOT NULL DEFAULT 0 CHECK (typeof(budget_amount_satang) = 'integer' AND budget_amount_satang >= 0),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (project_id, activity_name)
);
CREATE INDEX IF NOT EXISTS idx_activities_project ON project_activities (project_id);
ALTER TABLE expense_transactions ADD COLUMN activity_id TEXT REFERENCES project_activities(id);
-- An expense may name an activity only of the project it is charged to.
CREATE TRIGGER IF NOT EXISTS trg_expense_activity_ins BEFORE INSERT ON expense_transactions
WHEN NEW.activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_activities a WHERE a.id = NEW.activity_id AND a.project_id = NEW.project_id)
BEGIN SELECT RAISE(ABORT, 'activity_project_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS trg_expense_activity_upd BEFORE UPDATE OF activity_id, project_id ON expense_transactions
WHEN NEW.activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_activities a WHERE a.id = NEW.activity_id AND a.project_id = NEW.project_id)
BEGIN SELECT RAISE(ABORT, 'activity_project_mismatch'); END;
