export class Confirmation {
    [key: string]: any; // Allow any property for deserialization

    public id: number | undefined;
    public nonce: number | undefined;
    public creator_id: number | undefined;
    public headline: string | undefined;
    public summary: string[] | undefined;
    public accept: string | undefined;
    public cancel: string | undefined;
    public icon: string | undefined;
    public type: EMobileConfirmationType | undefined;

    public get conf_type(): EMobileConfirmationType {
        return this.type || EMobileConfirmationType.Invalid;
    }

    public get creator(): number {
        return this.creator_id || 0;
    }

    public get key(): string {
        return this.nonce?.toString() || "";
    }
}

export class ConfirmationsResponse {
    [key: string]: any; // Allow any property for deserialization

    public success: boolean | undefined;
    public message: string | undefined;
    public needauth: boolean | undefined;
    public conf: Confirmation[] | undefined;

    public get need_authentication(): boolean {
        return this.needauth || false;
    }

    public get confirmations(): Confirmation[] {
        return this.conf || [];
    }
}

export enum EMobileConfirmationType {
    Invalid = 0,
    Test = 1,
    Trade = 2,
    MarketListing = 3,
    FeatureOptOut = 4,
    PhoneNumberChange = 5,
    AccountRecovery = 6,
}
