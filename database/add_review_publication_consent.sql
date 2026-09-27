-- Run this on databases where add_reviews.sql was already applied.
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS review_public boolean NOT NULL DEFAULT false;

-- Existing reviews stay private until their authors explicitly opt in.
UPDATE projects
SET review_public = false
WHERE review_public IS NULL;
