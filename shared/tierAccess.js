// shared/tierAccess.js — NEW
// Single source of truth for subscription tier logic — previously
// this lived only inside ReportsSearchIdCards.jsx, meaning any new
// screen (like the three Analytics screens) had no shared way to
// check it and would have needed its own copy, risking drift if tiers
// are ever renamed or reordered in one place but not another.

export const TIER_ORDER = ['basic', 'standard', 'advanced', 'specialised'];

export function canAccess(userTier, requiredTier) {
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(requiredTier);
}
