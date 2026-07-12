-- Add rating and feedback_text to projects table
ALTER TABLE projects ADD COLUMN rating smallint NULL;
ALTER TABLE projects ADD COLUMN feedback_text text NULL;
