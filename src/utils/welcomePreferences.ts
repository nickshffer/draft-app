// Local storage keys for welcome popup preferences
const WELCOME_PREFS_KEY = 'fantasy-draft-welcome-prefs';

interface WelcomePreferences {
  hostDismissed: boolean;
  viewerDismissed: boolean;
}

const getDefaultPreferences = (): WelcomePreferences => ({
  hostDismissed: false,
  viewerDismissed: false
});

export const getWelcomePreferences = (): WelcomePreferences => {
  try {
    const stored = localStorage.getItem(WELCOME_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...getDefaultPreferences(), ...parsed };
    }
  } catch (error) {
    console.warn('Failed to parse welcome preferences from localStorage:', error);
  }
  return getDefaultPreferences();
};

export const setWelcomePreferences = (prefs: WelcomePreferences): void => {
  try {
    localStorage.setItem(WELCOME_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Failed to save welcome preferences to localStorage:', error);
  }
};

export const shouldShowWelcome = (isHost: boolean): boolean => {
  const prefs = getWelcomePreferences();
  return isHost ? !prefs.hostDismissed : !prefs.viewerDismissed;
};

export const dismissWelcome = (isHost: boolean): void => {
  const prefs = getWelcomePreferences();
  if (isHost) {
    prefs.hostDismissed = true;
  } else {
    prefs.viewerDismissed = true;
  }
  setWelcomePreferences(prefs);
};

export const resetWelcomePreferences = (): void => {
  setWelcomePreferences(getDefaultPreferences());
};
