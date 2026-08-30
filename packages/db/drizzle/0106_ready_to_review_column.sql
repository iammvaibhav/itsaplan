-- Custom SQL migration file, put your code below! --
-- Seed the `Ready to review` column on existing projects that lack it.
-- Positioned at the end of the project's existing columns (position = max(position) + 1),
-- which listColumns sorts after 'In Progress' and before 'Done' by state type.
INSERT INTO "project_column" ("project_id", "name", "state_type", "color", "position", "wip_mode")
SELECT
  p."id" AS "project_id",
  'Ready to review' AS "name",
  'started' AS "state_type",
  '#6b7280' AS "color",
  COALESCE((SELECT MAX(pc."position") + 1 FROM "project_column" pc WHERE pc."project_id" = p."id"), 0) AS "position",
  'soft' AS "wip_mode"
FROM "project" p
WHERE NOT EXISTS (
  SELECT 1 FROM "project_column" pc
  WHERE pc."project_id" = p."id" AND pc."name" = 'Ready to review'
);
