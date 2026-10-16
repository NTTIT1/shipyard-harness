/** The delete dialog unlocks only when the project's slug is typed exactly. */
export const deleteConfirmMatches = (typed, slug) => !!slug && String(typed || '').trim() === slug;
