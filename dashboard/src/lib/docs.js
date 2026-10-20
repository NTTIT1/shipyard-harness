import { runSteps } from './review.js';

/** One row per pipeline step: the approved revision (else the latest), how many revisions, step status. */
export function finalRevisions(view) {
  return runSteps(view.steps).map(step => {
    const revs = (view.revisions || []).filter(r => r.step === step);
    const approved = [...revs].reverse().find(r => r.approvalStatus === 'APPROVED');
    return {
      step,
      status: (view.steps || []).find(s => s.step === step)?.status || 'PENDING',
      revision: approved || revs[revs.length - 1] || null,
      approved: !!approved,
      count: revs.length,
    };
  });
}

/** The documents as approved (AI text + human edits), each flagged when a human edited it. */
export function finalDocuments(detail) {
  const docs = detail.approvedDocuments || detail.documents || {};
  const edited = detail.editedDocuments || {};
  return Object.entries(docs).map(([name, text]) => ({ name, text, edited: Object.hasOwn(edited, name) }));
}

export const mdDownloadName = (title, step, name) =>
  `${String(title || 'feature').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}_${step}_${name}`;
