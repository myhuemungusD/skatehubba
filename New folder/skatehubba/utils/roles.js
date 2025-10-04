// User roles enum
export const ROLES = {
  USER: 'user',
  VERIFIED: 'verified',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
};

// Role hierarchy (higher roles include permissions of lower roles)
export const ROLE_HIERARCHY = {
  [ROLES.USER]: 0,
  [ROLES.VERIFIED]: 1,
  [ROLES.MODERATOR]: 2,
  [ROLES.ADMIN]: 3,
};

// Permission checks
export const hasRole = (userRole, requiredRole) => {
  if (!userRole || !requiredRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
};

// Screen access configuration
export const SCREEN_ACCESS = {
  Profile: [ROLES.USER],
  Shop: [ROLES.USER],
  Sessions: [ROLES.USER],
  Challenges: [ROLES.USER],
  Lobbies: [ROLES.USER],
  Checkins: [ROLES.USER],
  Archive: [ROLES.VERIFIED],
  Verify: [ROLES.MODERATOR],
  Admin: [ROLES.ADMIN],
};

// Check if user can access a screen
export const canAccessScreen = (userRole, screenName) => {
  const requiredRoles = SCREEN_ACCESS[screenName];
  if (!requiredRoles) return true; // Default to accessible if not specified
  return requiredRoles.some(role => hasRole(userRole, role));
};
