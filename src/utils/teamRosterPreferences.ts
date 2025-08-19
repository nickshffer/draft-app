// Local storage key for team roster preferences
const TEAM_ROSTER_PREFS_KEY = 'fantasy-draft-team-roster-prefs';

interface TeamRosterPreferences {
  selectedTeamId: number | null;
}

const getDefaultPreferences = (): TeamRosterPreferences => ({
  selectedTeamId: null
});

export const getTeamRosterPreferences = (): TeamRosterPreferences => {
  try {
    const stored = localStorage.getItem(TEAM_ROSTER_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...getDefaultPreferences(), ...parsed };
    }
  } catch (error) {
    console.warn('Failed to parse team roster preferences from localStorage:', error);
  }
  return getDefaultPreferences();
};

export const setTeamRosterPreferences = (prefs: TeamRosterPreferences): void => {
  try {
    localStorage.setItem(TEAM_ROSTER_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Failed to save team roster preferences to localStorage:', error);
  }
};

export const setSelectedTeamId = (teamId: number | null): void => {
  const prefs = getTeamRosterPreferences();
  setTeamRosterPreferences({ ...prefs, selectedTeamId: teamId });
};

export const getSelectedTeamId = (): number | null => {
  return getTeamRosterPreferences().selectedTeamId;
};
