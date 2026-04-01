/**
 * @typedef {Object} ViewerUser
 * @property {{ id: string, roles: string[] }} profile
 * @property {Record<string, { enabled: boolean, weight: number }>} flags
 */

/** @type {ViewerUser} */
export const viewerUser = {
  profile: {
    id: 'viewer-user',
    roles: ['reader'],
  },
  flags: {
    search: {
      enabled: true,
      weight: 10,
    },
  },
};