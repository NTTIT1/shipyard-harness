-- Hibernate created a CHECK listing only the original 5 roles; V2 kept it, so PM/BA/TECH_LEAD/TESTER
-- could not be stored on upgraded installs. Replace it with the full role list.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_members') THEN
        ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
        ALTER TABLE project_members ADD CONSTRAINT project_members_role_check CHECK (role IN
            ('OWNER', 'MAINTAINER', 'DEVELOPER', 'DESIGNER', 'VIEWER', 'PM', 'BA', 'TECH_LEAD', 'TESTER'));
    END IF;
END $$;
