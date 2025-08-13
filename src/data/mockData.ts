import { Player, PositionCategories } from '../types';

// Position categories
export const positionCategories: PositionCategories = {
  "QB": "Quarterbacks",
  "RB": "Running Backs",
  "WR": "Wide Receivers",
  "TE": "Tight Ends",
  "K": "Kickers",
  "DST": "Defense/Special Teams"
};

// League owners and team names
export const mockTeams = [
  { id: 1, owner: "Adwai", name: "Licking My Lamb Chops" },
  { id: 2, owner: "Tommy", name: "Hurts to be in the Pitts" },
  { id: 3, owner: "Neill", name: "West Coast Wankers" },
  { id: 4, owner: "Mitoma", name: "$11 Mahomies" },
  { id: 5, owner: "Alex W", name: "Degen Elegy" },
  { id: 6, owner: "Tyler", name: "Too Late?" },
  { id: 7, owner: "Nick", name: "Let Allen Cook" },
  { id: 8, owner: "Henry", name: "Mack Daddy of Heimlich County" },
  { id: 9, owner: "Grant", name: "G Money" },
  { id: 10, owner: "Mitch", name: "Guess Who's Dak, Dak Again" },
];

// Full player data from the provided dataset
export const playerData: Player[] = [
  { id: 1, rank: 1, position: "WR", name: "Ja'Marr Chase", team: "CIN", bye: 10, projectedValue: 57, projectedPoints: 351.75 },
  { id: 2, rank: 2, position: "RB", name: "Bijan Robinson", team: "ATL", bye: 5, projectedValue: 56, projectedPoints: 317.44 },
  { id: 3, rank: 3, position: "WR", name: "Justin Jefferson", team: "MIN", bye: 6, projectedValue: 55, projectedPoints: 311.52 },
  { id: 4, rank: 4, position: "RB", name: "Saquon Barkley", team: "PHI", bye: 9, projectedValue: 55, projectedPoints: 315.08 },
  { id: 5, rank: 5, position: "RB", name: "Jahmyr Gibbs", team: "DET", bye: 8, projectedValue: 54, projectedPoints: 316.93 },
  { id: 6, rank: 6, position: "WR", name: "CeeDee Lamb", team: "DAL", bye: 10, projectedValue: 52, projectedPoints: 304.58 },
  { id: 7, rank: 7, position: "RB", name: "Christian McCaffrey", team: "SF", bye: 14, projectedValue: 53, projectedPoints: 293.75 },
  { id: 8, rank: 8, position: "WR", name: "Puka Nacua", team: "LAR", bye: 8, projectedValue: 53, projectedPoints: 293.63 },
  { id: 9, rank: 9, position: "WR", name: "Malik Nabers", team: "NYG", bye: 14, projectedValue: 51, projectedPoints: 287.47 },
  { id: 10, rank: 10, position: "WR", name: "Amon-Ra St. Brown", team: "DET", bye: 8, projectedValue: 50, projectedPoints: 291.82 },
  { id: 11, rank: 11, position: "RB", name: "Ashton Jeanty", team: "LV", bye: 8, projectedValue: 46, projectedPoints: 263.89 },
  { id: 12, rank: 12, position: "RB", name: "De'Von Achane", team: "MIA", bye: 12, projectedValue: 37, projectedPoints: 289.25 },
  { id: 13, rank: 13, position: "WR", name: "Nico Collins", team: "HOU", bye: 6, projectedValue: 45, projectedPoints: 275.91 },
  { id: 14, rank: 14, position: "WR", name: "Brian Thomas Jr.", team: "JAX", bye: 8, projectedValue: 43, projectedPoints: 273.09 },
  { id: 15, rank: 15, position: "WR", name: "A.J. Brown", team: "PHI", bye: 9, projectedValue: 42, projectedPoints: 255.62 },
  { id: 16, rank: 16, position: "WR", name: "Drake London", team: "ATL", bye: 5, projectedValue: 40, projectedPoints: 261.37 },
  { id: 17, rank: 17, position: "RB", name: "Jonathan Taylor", team: "IND", bye: 11, projectedValue: 38, projectedPoints: 242.05 },
  { id: 18, rank: 18, position: "RB", name: "Josh Jacobs", team: "GB", bye: 5, projectedValue: 36, projectedPoints: 264.72 },
  { id: 19, rank: 19, position: "RB", name: "Derrick Henry", team: "BAL", bye: 7, projectedValue: 48, projectedPoints: 266.44 },
  { id: 20, rank: 20, position: "TE", name: "Brock Bowers", team: "LV", bye: 8, projectedValue: 35, projectedPoints: 254.75 },
  // More players can be added here...
];