import toughCookie from "tough-cookie";
import { CookieAwareClient } from "./CookieAwareClient";

export class SteamClient {
    public static MOBILE_APP_USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 9; Valve Steam App Version/3)";

    static async get(url: string, cookies: toughCookie.CookieJar): Promise<string> {
        const client = new CookieAwareClient();
        cookies.getCookiesSync(url).forEach(cookie => {
            client.cookieJar.setCookieSync(cookie, url);
        });
        const response = await client.get(url, { headers: { "User-Agent": this.MOBILE_APP_USER_AGENT } });
        return response.data;
    }

    static async post(url: string, cookies: toughCookie.CookieJar, body: Record<string, string>): Promise<string> {
        const client = new CookieAwareClient();
        cookies.getCookiesSync(url).forEach(cookie => {
            client.cookieJar.setCookieSync(cookie, url);
        });
        const response = await client.post(url, body, { headers: { "User-Agent": this.MOBILE_APP_USER_AGENT } });
        return response.data;
    }
}
