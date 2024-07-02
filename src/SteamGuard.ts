import * as crypto from "crypto";
import axios from "axios";
import { SteamApiEndpoints } from "./SteamApiEndpoints";
import { TimeAligner } from "./TimeAligner"; // Assuming you have an APIEndpoints file with TWO_FACTOR_TIME_QUERY
import { SteamClient } from "./SteamClient";
import toughCookie from "tough-cookie";
import { EMobileConfirmationType } from "./Confirmation";

export class SteamGuardAccount {
    [key: string]: any; // Allow any property for deserialization

    public shared_secret: string | undefined;
    public serial_number: string | undefined;
    public revocation_code: string | undefined;
    public uri: string | undefined;
    public server_time: number | undefined;
    public account_name: string | undefined;
    public token_gid: string | undefined;
    public identity_secret: string | undefined;
    public secret_1: string | undefined;
    public status: number | undefined;
    public device_id: string | undefined;
    public fully_enrolled: boolean | undefined;
    public session: SessionData | undefined;

    private static steamGuardCodeTranslations = [
        50, 51, 52, 53, 54, 55, 56, 57, 66, 67, 68, 70, 71, 72, 74, 75, 77, 78, 80, 81, 82, 84, 86, 87, 88, 89
    ];

    public async deactivateAuthenticator(scheme: number = 1): Promise<boolean> {
        const postBody = {
            revocation_code: this.revocation_code,
            revocation_reason: "1",
            steamguard_scheme: scheme.toString()
        };
        const response = await axios.post(
            `${SteamApiEndpoints.STEAMAPI_BASE}/ITwoFactorService/RemoveAuthenticator/v1?access_token=${this.session?.accessToken}`,
            postBody
        );

        const removeResponse: RemoveAuthenticatorResponse = JSON.parse(response.data);
        return removeResponse?.response?.success || false;
    }

    public async generateSteamGuardCode(): Promise<string> {
        return this.generateSteamGuardCodeForTime(await TimeAligner.getSteamTime());
    }

    public generateSteamGuardCodeForTime(time: number): string {
        if (!this.shared_secret) {
            return "";
        }

        const sharedSecretArray = Buffer.from(this.shared_secret, "base64");
        const timeArray = new Uint8Array(8);

        let time30 = Math.floor(time / 30);
        for (let i = 7; i >= 0; i--) {
            timeArray[i] = time30 & 0xff;
            time30 >>= 8;
        }

        const hmacGenerator = crypto.createHmac("sha1", sharedSecretArray);
        const hashedData = hmacGenerator.update(timeArray).digest();
        const codeArray = new Uint8Array(5);

        const b = hashedData[19] & 0x0f;
        let codePoint =
            (hashedData[b] & 0x7f) << 24 |
            (hashedData[b + 1] & 0xff) << 16 |
            (hashedData[b + 2] & 0xff) << 8 |
            (hashedData[b + 3] & 0xff);

        for (let i = 0; i < 5; ++i) {
            codeArray[i] = SteamGuardAccount.steamGuardCodeTranslations[codePoint % SteamGuardAccount.steamGuardCodeTranslations.length];
            codePoint /= SteamGuardAccount.steamGuardCodeTranslations.length;
        }

        return Buffer.from(codeArray).toString("utf8");
    }

    public async fetchConfirmations(): Promise<Confirmation[]> {
        const url = await this.generateConfirmationURL();
        const response = await SteamClient.get(url, this.session!.getCookies());
        return this.fetchConfirmationInternal(response);
    }

    private fetchConfirmationInternal(response: string): Confirmation[] {
        const confirmationsResponse: ConfirmationsResponse = JSON.parse(response);

        if (!confirmationsResponse.success) {
            throw new Error(confirmationsResponse.message);
        }

        if (confirmationsResponse.need_authentication) {
            throw new Error("Needs Authentication");
        }

        return confirmationsResponse.confirmations;
    }

    public getConfirmationTradeOfferID(conf: Confirmation): number {
        if (conf.conf_type !== EMobileConfirmationType.Trade) {
            throw new Error("conf must be a trade confirmation.");
        }

        return conf.creator;
    }

    public acceptMultipleConfirmations(confs: Confirmation[]): Promise<boolean> {
        return this._sendMultiConfirmationAjax(confs, "allow");
    }

    public denyMultipleConfirmations(confs: Confirmation[]): Promise<boolean> {
        return this._sendMultiConfirmationAjax(confs, "cancel");
    }

    public acceptConfirmation(conf: Confirmation): Promise<boolean> {
        return this._sendConfirmationAjax(conf, "allow");
    }

    public denyConfirmation(conf: Confirmation): Promise<boolean> {
        return this._sendConfirmationAjax(conf, "cancel");
    }

    private async _sendConfirmationAjax(conf: Confirmation, op: string): Promise<boolean> {
        let url = SteamApiEndpoints.COMMUNITY_BASE + "/mobileconf/ajaxop";
        let queryString = "?op=" + op + "&";
        // tag is different from op now
        let tag = op === "allow" ? "accept" : "reject";
        queryString += this.generateConfirmationQueryParams(tag);
        queryString += "&cid=" + conf.id + "&ck=" + conf.key;
        url += queryString;

        const response = await SteamClient.get(url, this.session!.getCookies());
        if (!response) return false;

        const confResponse: SendConfirmationResponse = JSON.parse(response);
        return confResponse.success;
    }

    private async _sendMultiConfirmationAjax(confs: Confirmation[], op: string): Promise<boolean> {
        let url = SteamApiEndpoints.COMMUNITY_BASE + "/mobileconf/multiajaxop";
        // tag is different from op now
        let tag = op === "allow" ? "accept" : "reject";
        let query = "op=" + op + "&" + this.generateConfirmationQueryParams(tag);
        for (const conf of confs) {
            query += "&cid[]=" + conf.id + "&ck[]=" + conf.key;
        }

        const response = await axios.post(url, query, { headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } });

        if (!response) return false;

        const confResponse: SendConfirmationResponse = JSON.parse(response.data);
        return confResponse.success;
    }

    public async generateConfirmationURL(tag: string = "conf"): Promise<string> {
        let endpoint = SteamApiEndpoints.COMMUNITY_BASE + "/mobileconf/getlist?";
        let queryString = await this.generateConfirmationQueryParams(tag);
        return endpoint + queryString;
    }

    public async generateConfirmationQueryParams(tag: string): Promise<string> {
        if (!this.device_id) {
            throw new Error("Device ID is not present");
        }

        const queryParams = await this.generateConfirmationQueryParamsAsNVC(tag);

        return Object.entries(queryParams).map(([key, value]) => `${key}=${value}`).join("&");
    }

    public async generateConfirmationQueryParamsAsNVC(tag: string): Promise<Record<string, string>> {
        if (!this.device_id) {
            throw new Error("Device ID is not present");
        }

        const time = await TimeAligner.getSteamTime();

        const ret: Record<string, string> = {};
        ret.p = this.device_id;
        ret.a = this.session!.steamID!.toString();
        ret.k = this._generateConfirmationHashForTime(time, tag);
        ret.t = time.toString();
        ret.m = "react";
        ret.tag = tag;

        return ret;
    }

    private _generateConfirmationHashForTime(time: number, tag: string): string {
        const decode = Buffer.from(this.identity_secret!, "base64");
        let n2 = 8;
        if (tag) {
            if (tag.length > 32) {
                n2 = 8 + 32;
            } else {
                n2 = 8 + tag.length;
            }
        }
        const array = new Uint8Array(n2);
        let n3 = 8;
        while (true) {
            const n4 = n3 - 1;
            if (n3 <= 0) {
                break;
            }
            array[n4] = time & 0xff;
            time >>= 8;
            n3 = n4;
        }
        if (tag) {
            const tagBytes = Buffer.from(tag, "utf8");
            tagBytes.copy(array, 8);
        }

        const hmacGenerator = crypto.createHmac("sha1", decode);
        const hashedData = hmacGenerator.update(array).digest();
        const encodedData = hashedData.toString("base64");

        return encodeURIComponent(encodedData);
    }

    public WGTokenInvalidException: any; // Placeholder for custom exception
    public WGTokenExpiredException: any; // Placeholder for custom exception

    private RemoveAuthenticatorResponse: any; // Placeholder for custom exception

    private SendConfirmationResponse: any; // Placeholder for custom exception

    private ConfirmationDetailsResponse: any; // Placeholder for custom exception
}

// Placeholder for SessionData interface
interface SessionData {
    accessToken: string | undefined;
    steamID: number | undefined;

    getCookies(): toughCookie.CookieJar;
}

// Placeholder for Confirmation interface
interface Confirmation {
    conf_type: EMobileConfirmationType;
    id: number;
    key: string;
    creator: number;
}

interface ConfirmationsResponse {
    success: boolean;
    message: string;
    need_authentication: boolean;
    confirmations: Confirmation[];
}

interface RemoveAuthenticatorResponse {
    response: RemoveAuthenticatorInternalResponse;
}

interface RemoveAuthenticatorInternalResponse {
    success: boolean;
    revocation_attempts_remaining: number;
}

interface SendConfirmationResponse {
    success: boolean;
}

interface ConfirmationDetailsResponse {
    success: boolean;
    html: string;
}
