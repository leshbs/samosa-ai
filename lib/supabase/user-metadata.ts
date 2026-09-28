/**
 * Keys this app writes into `auth.users.raw_user_meta_data`. Shared by the
 * signup form (browser) and the auth module (server), so it cannot live behind
 * the module's server-only public API.
 */

/** Display name; also what Google fills in on an OAuth signup. */
export const FULL_NAME_METADATA_KEY = 'full_name'

/**
 * The organization name typed at signup. With email confirmation on there is
 * no session yet when the form is sent, so the name travels with the account
 * until the first confirmed sign-in creates the organization.
 */
export const ORGANIZATION_NAME_METADATA_KEY = 'organization_name'
