-- A member may hold several roles: the PK becomes (project_id, user_id, role).
-- On a fresh DB the table does not exist yet (Hibernate creates it with the new PK after Flyway).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_members') THEN
        ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_pkey;
        ALTER TABLE project_members ADD PRIMARY KEY (project_id, user_id, role);
    END IF;
END $$;
