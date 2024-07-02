import axios from "axios";
import { DateTime } from "luxon";
import { SteamApiEndpoints } from "./SteamApiEndpoints";

export class TimeAligner {
    private static _aligned = false;
    private static _timeDifference = 0;

    public static async getSteamTime(): Promise<number> {
        if (!TimeAligner._aligned) {
            await TimeAligner.alignTime();
        }
        return DateTime.now().toSeconds() + TimeAligner._timeDifference;
    }

    public static async alignTime(): Promise<void> {
        const currentTime = DateTime.now().toSeconds();
        try {
            const response = await axios.post(SteamApiEndpoints.TWO_FACTOR_TIME_QUERY, "steamid=0");
            const query: TimeQuery = JSON.parse(response.data);
            TimeAligner._timeDifference = Math.floor(query.response.server_time - currentTime);
            TimeAligner._aligned = true;
        } catch (error) {
            // Handle the error (e.g., log it, retry, etc.)
            console.error("Error aligning time:", error);
        }
    }
}

interface TimeQuery {
    response: TimeQueryResponse;
}

interface TimeQueryResponse {
    server_time: number;
}
