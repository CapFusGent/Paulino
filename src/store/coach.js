// Coach-side data access. Paul's edits are autosaved as a local draft until he
// presses Save; saving is optimistic-concurrency checked on the server
// (expected version), so two devices can never silently overwrite each other.
import { storage } from './storage.js';
import { EXERCISES } from '../data/exercises.js';

export function createCoachStore(api) {
  const cacheKey = () => `coach.${api.session?.user?.id || 'anon'}`;
  const cache = () => storage.get(cacheKey(), {});
  const writeCache = (patch) => storage.set(cacheKey(), { ...cache(), ...patch });

  return {
    get signedIn() { return Boolean(api.session); },
    get user() { return api.session?.user || null; },

    async dashboard() {
      try {
        const d = await api.rpcCoach('coach_dashboard');
        if (!d.profile) await api.rpcCoach('coach_me', {});
        writeCache({ dashboard: d });
        return { data: d, offline: false };
      } catch (e) {
        if (e.offline && cache().dashboard) return { data: cache().dashboard, offline: true };
        throw e;
      }
    },
    cachedDashboard: () => cache().dashboard || null,

    async exercises() {
      try {
        const list = await api.rpcCoach('coach_list_exercises');
        writeCache({ exercises: list });
        return list;
      } catch (e) {
        if (e.offline) return cache().exercises || EXERCISES.map((x) => ({ ...x, custom: false }));
        throw e;
      }
    },

    async getProgram(id) {
      try {
        const p = await api.rpcCoach('coach_get_program', { p_program_id: id });
        writeCache({ [`program.${id}`]: p });
        return { data: p, offline: false };
      } catch (e) {
        if (e.offline && cache()[`program.${id}`]) return { data: cache()[`program.${id}`], offline: true };
        throw e;
      }
    },

    saveProgram(program, expectedVersion) {
      return api.rpcCoach('coach_save_program', { p_program: program, p_expected_version: expectedVersion ?? null });
    },
    duplicateProgram(id, name, clientId = null, shiftDays = 0) {
      return api.rpcCoach('coach_duplicate_program', { p_program_id: id, p_name: name, p_client_id: clientId, p_shift_days: shiftDays });
    },
    deleteProgram: (id) => api.rpcCoach('coach_delete_program', { p_program_id: id }),
    revisions: (id) => api.rpcCoach('coach_program_revisions', { p_program_id: id }),
    createClient: (name) => api.rpcCoach('coach_create_client', { p_display_name: name }),
    updateClient: (id, name, archived = false) => api.rpcCoach('coach_update_client', { p_client_id: id, p_display_name: name, p_archived: archived }),
    rotateLink: (id) => api.rpcCoach('coach_rotate_client_link', { p_client_id: id }),
    clientOverview: (id) => api.rpcCoach('coach_client_overview', { p_client_id: id }),
    addExercise: (name, category, description) => api.rpcCoach('coach_add_exercise', { p_name: name, p_category: category, p_description: description }),
    setName: (name) => api.rpcCoach('coach_me', { p_display_name: name }),

    // ---- local drafts ----
    draft: (id) => storage.get(`draft.${id}`, null),
    saveDraft: (id, program, baseVersion) => storage.set(`draft.${id}`, { program, baseVersion, savedAt: new Date().toISOString() }),
    clearDraft: (id) => storage.remove(`draft.${id}`),
  };
}

export function shareLink(token) {
  const u = new URL(location.href);
  u.hash = `#/a/${token}`;
  u.search = '';
  return u.toString();
}
