import axios from "axios";
import { DateTime } from "luxon";
import { SteamGuardAccount } from "./SteamGuard"; // Assuming you have a SteamGuardAccount file
import { SteamApiEndpoints } from "./SteamApiEndpoints"; // Assuming you have an APIEndpoints file with TWO_FACTOR_TIME_QUERY
import { CookieAwareClient } from "./CookieAwareClient"; // Assuming you have a CookieAwareWebClient file
import { TimeAligner } from "./TimeAligner";
import toughCookie from "tough-cookie";
import { SteamClient } from "./SteamClient"; // Assuming you have a TimeAligner file

export class AuthenticatorLinker {
    private session: SessionData | null = null;
    public phoneNumber: string | null = null;
    public phoneCountryCode: string | null = null;
    public deviceID: string;
    public linkedAccount: SteamGuardAccount | null = null;
    public finalized = false;
    private confirmationEmailSent = false;
    public confirmationEmailAddress: string | undefined;

    constructor(sessionData: SessionData) {
        this.session = sessionData;
        this.deviceID = AuthenticatorLinker.generateDeviceID();
    }

    public async addAuthenticator(): Promise<LinkResult> {
        if (this.confirmationEmailSent) {
            // Check if email was confirmed
            const isStillWaiting = await this._isAccountWaitingForEmailConfirmation();
            if (isStillWaiting) {
                return LinkResult.MustConfirmEmail;
            } else {
                // Now send the SMS to the phone number
                await this._sendPhoneVerificationCode();

                // This takes time so wait a bit
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Make request to ITwoFactorService/AddAuthenticator
        const addAuthenticatorBody = {
            steamid: this.session?.steamID?.toString(),
            authenticator_time: (await TimeAligner.getSteamTime()).toString(),
            authenticator_type: "1",
            device_identifier: this.deviceID,
            sms_phone_id: "1"
        };
        const addAuthenticatorResponseStr = await axios.post(
            `${SteamApiEndpoints.STEAMAPI_BASE}/ITwoFactorService/AddAuthenticator/v1/?access_token=${this.session?.accessToken}`,
            addAuthenticatorBody
        );

        const addAuthenticatorResponse: AddAuthenticatorResponse = JSON.parse(addAuthenticatorResponseStr.data);

        if (!addAuthenticatorResponse || !addAuthenticatorResponse.response) {
            return LinkResult.GeneralFailure;
        }

        // Status 2 means no phone number is on the account
        if (addAuthenticatorResponse.response.status === 2) {
            if (!this.phoneNumber) {
                return LinkResult.MustProvidePhoneNumber;
            } else {
                // Add phone number

                // Get country code
                let countryCode = this.phoneCountryCode;

                // If given country code is null, use the one from the Steam account
                if (!countryCode) {
                    countryCode = await this.getUserCountry();
                }

                // Set the phone number
                const res = await this._setAccountPhoneNumber(this.phoneNumber, countryCode);

                // Make sure it's successful then respond that we must confirm via email
                if (res && res.response.confirmation_email_address) {
                    this.confirmationEmailAddress = res.response.confirmation_email_address;
                    this.confirmationEmailSent = true;
                    return LinkResult.MustConfirmEmail;
                }

                // If something else fails, we end up here
                return LinkResult.FailureAddingPhone;
            }
        }

        if (addAuthenticatorResponse.response.status === 29) {
            return LinkResult.AuthenticatorPresent;
        }

        if (addAuthenticatorResponse.response.status !== 1) {
            return LinkResult.GeneralFailure;
        }

        // Setup this.linkedAccount
        this.linkedAccount = addAuthenticatorResponse.response;
        this.linkedAccount.deviceID = this.deviceID;
        this.linkedAccount.session = this.session || undefined;

        return LinkResult.AwaitingFinalization;
    }

    public async finalizeAddAuthenticator(smsCode: string): Promise<FinalizeResult> {
        let tries = 0;
        while (tries <= 10) {
            const finalizeAuthenticatorValues = {
                steamid: this.session?.steamID?.toString(),
                authenticator_code: this.linkedAccount?.GenerateSteamGuardCode(),
                authenticator_time: TimeAligner.getSteamTime().toString(),
                activation_code: smsCode,
                validate_sms_code: "1"
            };

            let finalizeAuthenticatorResultStr;
            try {
                const finalizeAuthenticatorResult = await axios.post(
                    `${SteamApiEndpoints.STEAMAPI_BASE}/ITwoFactorService/FinalizeAddAuthenticator/v1/?access_token=${this.session?.accessToken}`,
                    finalizeAuthenticatorValues
                );

                finalizeAuthenticatorResultStr = finalizeAuthenticatorResult.data;
            } catch (error) {
                console.error("Error finalizing authenticator:", error);
                return FinalizeResult.GeneralFailure;
            }

            const finalizeAuthenticatorResponse: FinalizeAuthenticatorResponse = JSON.parse(finalizeAuthenticatorResultStr);

            if (!finalizeAuthenticatorResponse || !finalizeAuthenticatorResponse.response) {
                return FinalizeResult.GeneralFailure;
            }

            if (finalizeAuthenticatorResponse.response.status === 89) {
                return FinalizeResult.BadSMSCode;
            }

            if (finalizeAuthenticatorResponse.response.status === 88) {
                if (tries >= 10) {
                    return FinalizeResult.UnableToGenerateCorrectCodes;
                }
            }

            if (!finalizeAuthenticatorResponse.response.success) {
                return FinalizeResult.GeneralFailure;
            }

            if (finalizeAuthenticatorResponse.response.want_more) {
                tries++;
                continue;
            }

            this.linkedAccount!.fully_enrolled = true;
            return FinalizeResult.Success;
        }

        return FinalizeResult.GeneralFailure;
    }

    private async getUserCountry(): Promise<string> {
        const getCountryBody = {
            steamid: this.session?.steamID?.toString()
        };
        const getCountryResponseStr = await axios.post(
            `${SteamApiEndpoints.STEAMAPI_BASE}/IUserAccountService/GetUserCountry/v1?access_token=${this.session?.accessToken}`,
            getCountryBody
        );

        const response: GetUserCountryResponse = JSON.parse(getCountryResponseStr.data);
        return response?.response?.country;
    }

    private async _setAccountPhoneNumber(phoneNumber: string, countryCode: string): Promise<SetAccountPhoneNumberResponse | null> {
        const setPhoneBody = {
            phone_number: phoneNumber,
            phone_country_code: countryCode
        };
        const getCountryResponseStr = await axios.post(
            `${SteamApiEndpoints.STEAMAPI_BASE}/IPhoneService/SetAccountPhoneNumber/v1?access_token=${this.session?.accessToken}`,
            setPhoneBody
        );
        return JSON.parse(getCountryResponseStr.data) as SetAccountPhoneNumberResponse;
    }

    private async _isAccountWaitingForEmailConfirmation(): Promise<boolean> {
        const waitingForEmailResponse = await axios.post(
            `${SteamApiEndpoints.STEAMAPI_BASE}/IPhoneService/IsAccountWaitingForEmailConfirmation/v1?access_token=${this.session?.accessToken}`
        );

        const response: IsAccountWaitingForEmailConfirmationResponse = JSON.parse(waitingForEmailResponse.data);
        return response?.response?.awaiting_email_confirmation || false;
    }

    private async _sendPhoneVerificationCode(): Promise<boolean> {
        await axios.post(`${SteamApiEndpoints.STEAMAPI_BASE}/IPhoneService/SendPhoneVerificationCode/v1?access_token=${this.session?.accessToken}`);
        return true;
    }

    public static generateDeviceID(): string {
        return `android:${crypto.randomUUID()}`;
    }
}

// Enums for results
export enum LinkResult {
    MustProvidePhoneNumber, //No phone number on the account
    MustRemovePhoneNumber, //A phone number is already on the account
    MustConfirmEmail, //User need to click link from confirmation email
    AwaitingFinalization, //Must provide an SMS code
    GeneralFailure, //General failure (really now!)
    AuthenticatorPresent,
    FailureAddingPhone,
}

export enum FinalizeResult {
    BadSMSCode,
    UnableToGenerateCorrectCodes,
    Success,
    GeneralFailure,
}

// Interfaces for API responses
interface GetUserCountryResponse {
    response: GetUserCountryResponseResponse;
}

interface GetUserCountryResponseResponse {
    country: string;
}

interface SetAccountPhoneNumberResponse {
    response: SetAccountPhoneNumberResponseResponse;
}

interface SetAccountPhoneNumberResponseResponse {
    confirmation_email_address: string;
    phone_number_formatted: string;
}

interface IsAccountWaitingForEmailConfirmationResponse {
    response: IsAccountWaitingForEmailConfirmationResponseResponse;
}

interface IsAccountWaitingForEmailConfirmationResponseResponse {
    awaiting_email_confirmation: boolean;
    seconds_to_wait: number;
}

interface AddAuthenticatorResponse {
    response: SteamGuardAccount;
}

interface FinalizeAuthenticatorResponse {
    response: FinalizeAuthenticatorInternalResponse;
}

interface FinalizeAuthenticatorInternalResponse {
    success: boolean;
    want_more: boolean;
    server_time: number;
    status: number;
}

// Placeholder for SessionData interface
interface SessionData {
    steamID: number | undefined;
    accessToken: string | undefined;
    refreshToken: string | undefined;

    getCookies(): toughCookie.CookieJar;
}
