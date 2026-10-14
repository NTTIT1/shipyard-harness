-- Initialization script for Shipyard Platform logical databases
CREATE DATABASE auth_db;
CREATE DATABASE project_db;
CREATE DATABASE lane_db;
CREATE DATABASE orchestrator_db;
CREATE DATABASE llm_db;
CREATE DATABASE artifact_db;
CREATE DATABASE audit_db;

GRANT ALL PRIVILEGES ON DATABASE auth_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE project_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE lane_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE orchestrator_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE llm_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE artifact_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE audit_db TO postgres;
