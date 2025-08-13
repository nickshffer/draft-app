import { PositionBadgeColors } from '../types';

// Custom color scheme 
export const customColors = {
  headerGradientStart: "#04AEC5", // Cyan blue
  headerGradientEnd: "#EF416E", // Pink
  headerText: "#FCF188", // Yellow
  navyBlue: "#1A202E",
  buttonRed: "#FF4D6D",
  buttonBlue: "#04AEC5",
  lightBg: "#F8F9FA",
  tableBg: "#FFFFFF",
  borderColor: "#D1D5DB",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  highlightGreen: "#05DF72", // Added highlight green color
};

// Position badge colors - more flat retro style
export const positionBadgeColors: PositionBadgeColors = {
  QB: { bg: "#FFD166", text: "#000000" }, // Yellow
  RB: { bg: "#06D6A0", text: "#000000" }, // Green
  WR: { bg: "#118AB2", text: "#FFFFFF" }, // Blue
  TE: { bg: "#9D4EDD", text: "#FFFFFF" }, // Purple
  K: { bg: "#FF70A6", text: "#000000" },  // Pink
  DEF: { bg: "#9CA3AF", text: "#000000" }, // Gray
};
