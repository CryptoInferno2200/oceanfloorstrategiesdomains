-- Each customer project gets its own record store and a sandbox of editable files.
CREATE TABLE project_records (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  collection TEXT NOT NULL CHECK (collection ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_records_collection_idx ON project_records (project_id, collection, created_at DESC);

CREATE TABLE project_sandbox_files (
  project_id BIGINT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK (path IN ('index.html', 'styles.css', 'app.js')),
  content TEXT NOT NULL DEFAULT '' CHECK (OCTET_LENGTH(content) <= 262144),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, path)
);
