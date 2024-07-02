import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import toughCookie from "tough-cookie";
import { wrapper as cookieJarSupportWrapper } from "axios-cookiejar-support";

export class CookieAwareClient {
    private readonly axiosInstance: AxiosInstance;
    public readonly cookieJar: toughCookie.CookieJar;
    public responseCookies: toughCookie.Cookie[] = [];

    constructor() {
        this.cookieJar = new toughCookie.CookieJar();
        cookieJarSupportWrapper(axios);
        this.axiosInstance = axios.create({
            jar: this.cookieJar,
            withCredentials: true
        });
    }

    async get(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.axiosInstance.get(url, config)
            .then(response => {
                this.responseCookies = this.cookieJar.getCookiesSync(url);
                return response;
            });
    }

    async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.axiosInstance.post(url, data, config)
            .then(response => {
                this.responseCookies = this.cookieJar.getCookiesSync(url);
                return response;
            });
    }
}
