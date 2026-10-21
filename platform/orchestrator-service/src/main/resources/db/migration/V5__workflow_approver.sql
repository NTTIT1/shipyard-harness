-- Approver role and user assignment per workflow step
ALTER TABLE gate_policies ADD COLUMN approver_role VARCHAR(40);
ALTER TABLE gate_policies ADD COLUMN approver_id VARCHAR(40);
