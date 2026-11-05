import { tr } from './i18n.js';

// Who may do what on the dashboard: one table, shared by the server (which enforces it) and the UI
// (which only hides what the server would refuse). Project roles come from Shipyard Platform; a
// SYS_ADMIN may do everything. Gate approvals, the workflow and members are enforced by the platform
// itself (role holder / OWNER fallback; OWNER+MAINTAINER; OWNER) and are not repeated here.

/** Lane/project-scoped actions → the project roles allowed. */
export const PROJECT_ACTIONS = {
  view: null, // any member of the project
  work: ['OWNER', 'MAINTAINER', 'PM', 'TECH_LEAD'],      // give a lane a feature, chat with it, order its queue
  manage: ['OWNER', 'MAINTAINER', 'TECH_LEAD'],          // stop/resume/reset a lane, its pipeline and AI models
  costs: ['OWNER'],                                       // what the project's lanes cost
};

/** Install-wide actions: only a system administrator. */
export const ADMIN_ACTIONS = ['providers', 'models', 'gateway', 'quota', 'lane-add', 'credentials'];

export const isSysAdmin = user => !!user && (user.role === 'SYS_ADMIN' || user.systemRole === 'SYS_ADMIN');

/**
 * May `user` (with `roles` in the project) do `action`? `roles` is null when they are not a member.
 * A lane that belongs to no project (`roles === undefined` + `noProject`) is the administrator's.
 */
export function allowed(user, roles, action) {
  if (isSysAdmin(user)) return true;
  if (ADMIN_ACTIONS.includes(action)) return false;
  if (!Object.prototype.hasOwnProperty.call(PROJECT_ACTIONS, action)) return false;
  if (!Array.isArray(roles) || roles.length === 0) return false;
  const need = PROJECT_ACTIONS[action];
  return need === null || roles.some(r => need.includes(r));
}

/** Every project action → allowed?, as the server sends it with each lane (`lane.can`). */
export function capabilities(user, roles) {
  return Object.fromEntries(Object.keys(PROJECT_ACTIONS).map(a => [a, allowed(user, roles, a)]));
}

/** The UI's check on a lane from /api/lanes; an older server without `can` → allowed (it decides). */
export const canLane = (lane, action) => {
  if (!lane?.can) return true;
  if (lane.can.admin) return true;
  return ADMIN_ACTIONS.includes(action) ? false : lane.can[action] !== false;
};

/** Tooltip for a control the caller may not use. */
export const why = action => ({
  work: tr('Chỉ Owner, Maintainer, PM hoặc Tech Lead của dự án được giao việc hoặc nhắn cho lane'),
  manage: tr('Chỉ Owner, Maintainer hoặc Tech Lead của dự án được điều khiển lane, quy trình và model AI'),
  costs: tr('Chỉ Owner của dự án được xem chi phí'),
}[action] || tr('Chỉ quản trị viên hệ thống được làm việc này'));
