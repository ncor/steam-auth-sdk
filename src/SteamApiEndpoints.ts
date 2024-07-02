export class SteamApiEndpoints {
    public static readonly STEAMAPI_BASE = 'https://api.steampowered.com';
    public static readonly COMMUNITY_BASE = 'https://steamcommunity.com';
    public static readonly MOBILEAUTH_BASE = `${SteamApiEndpoints.STEAMAPI_BASE}/IMobileAuthService/%s/v0001`;
    public static readonly MOBILEAUTH_GETWGTOKEN = SteamApiEndpoints.MOBILEAUTH_BASE.replace('%s', 'GetWGToken');
    public static readonly TWO_FACTOR_BASE = `${SteamApiEndpoints.STEAMAPI_BASE}/ITwoFactorService/%s/v0001`;
    public static readonly TWO_FACTOR_TIME_QUERY = SteamApiEndpoints.TWO_FACTOR_BASE.replace('%s', 'QueryTime');
}
