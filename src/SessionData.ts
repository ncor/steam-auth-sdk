import * as crypto from "crypto";
import { DateTime } from "luxon";
import axios from "axios";
import toughCookie from "tough-cookie";
import { SteamApiEndpoints } from "./SteamApiEndpoints";

export class SessionData {
    public steamID: number | undefined;
    public accessToken: string | undefined;
    public refreshToken: string | undefined;
    public sessionID: string | undefined;

    public async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken) {
            throw new Error("Refresh token is empty");
        }
        if (this.isTokenExpired(this.refreshToken)) {
            throw new Error("Refresh token is expired");
        }

        try {
            const response = await axios.post(
                `${SteamApiEndpoints.STEAMAPI_BASE}/IAuthenticationService/GenerateAccessTokenForApp/v1/`,
                {
                    refresh_token: this.refreshToken,
                    steamid: this.steamID?.toString()
                }
            );

            const { response: { access_token: accessToken } } = JSON.parse(response.data) as GenerateAccessTokenForAppResponse;
            this.accessToken = accessToken;
        } catch (error) {
            throw new Error(`Failed to refresh token: ${(error as Error).message}`);
        }
    }

    public isAccessTokenExpired(): boolean {
        if (!this.accessToken) {
            return true;
        }
        return this.isTokenExpired(this.accessToken);
    }

    public isRefreshTokenExpired(): boolean {
        if (!this.refreshToken) {
            return true;
        }
        return this.isTokenExpired(this.refreshToken);
    }

    private isTokenExpired(token: string): boolean {
        const tokenComponents = token.split(".");
        let base64 = tokenComponents[1].replace("-", "+").replace("_", "/");

        if (base64.length % 4 !== 0) {
            base64 += "=".repeat(4 - base64.length % 4);
        }

        const payloadBytes = Buffer.from(base64, "base64");
        const jwt = JSON.parse(payloadBytes.toString()) as SteamAccessToken;

        return DateTime.now().toSeconds() > jwt.exp;
    }

    public getCookies(): toughCookie.CookieJar {
        if (!this.sessionID) {
            this.sessionID = this.GenerateSessionID();
        }

        const cookies = new toughCookie.CookieJar();
        for (const domain of ["steamcommunity.com", "store.steampowered.com"]) {
            cookies.setCookieSync(
                new toughCookie.Cookie({
                    key: "steamLoginSecure",
                    value: this.GetSteamLoginSecure(),
                    domain,
                    path: "/"
                }),
                domain
            );
            cookies.setCookieSync(
                new toughCookie.Cookie({
                    key: "sessionid",
                    value: this.sessionID,
                    domain,
                    path: "/"
                }),
                domain
            );
            cookies.setCookieSync(
                new toughCookie.Cookie({
                    key: "mobileClient",
                    value: "android",
                    domain,
                    path: "/"
                }),
                domain
            );
            cookies.setCookieSync(
                new toughCookie.Cookie({
                    key: "mobileClientVersion",
                    value: "777777 3.6.4",
                    domain,
                    path: "/"
                }),
                domain
            );
        }
        return cookies;
    }

    private GetSteamLoginSecure(): string {
        return `${this.steamID?.toString()}%7C%7C${this.accessToken}`;
    }

    private GenerateSessionID(): string {
        return this.GetRandomHexNumber(32);
    }

    private GetRandomHexNumber(digits: number): string {
        const buffer = Buffer.alloc(Math.ceil(digits / 2));
        crypto.randomFillSync(buffer);
        let result = buffer.toString("hex");
        if (digits % 2 === 0) {
            return result;
        }
        return result + Math.floor(Math.random() * 16).toString(16);
    }
}

// Interfaces for the responses
interface SteamAccessToken {
    exp: number;
}

interface GenerateAccessTokenForAppResponse {
    response: GenerateAccessTokenForAppResponseResponse;
}

interface GenerateAccessTokenForAppResponseResponse {
    access_token: string;
}
