import http, { ClientRequest, IncomingMessage } from 'node:http';
import https, { RequestOptions } from 'node:https';
import { URL } from 'node:url';
import { cookieHeaders, getCookies } from '../YouTube/utils/cookie';
import { Proxy } from './classes';

export type ProxyOptions = ProxyOpts | string;

interface RequestOpts extends RequestOptions {
    body?: string;
    method?: 'GET' | 'POST' | 'HEAD';
    proxies?: ProxyOptions[];
    cookies?: boolean;
}

interface ProxyOpts {
    host: string;
    port: number;
    authentication?: {
        username: string;
        password: string;
    };
}
/**
 * Main module which play-dl uses to make a request to stream url.
 * @param url URL to make https request to
 * @param options Request options for https request
 * @returns IncomingMessage from the request
 */
export function request_stream(req_url: string, options: RequestOpts = { method: 'GET' }): Promise<IncomingMessage> {
    return new Promise(async (resolve, reject) => {
        let res = await https_getter(req_url, options).catch((err: Error) => err);
        if (res instanceof Error) {
            reject(res);
            return;
        }
        if (Number(res.statusCode) >= 300 && Number(res.statusCode) < 400) {
            res = await request_stream(res.headers.location as string, options);
        }
        resolve(res);
    });
}
/**
 * Main module which play-dl uses to make a proxy or normal request
 * @param url URL to make https request to
 * @param options Request options for https request
 * @returns body of that request
 */
export function request(req_url: string, options: RequestOpts = { method: 'GET' }): Promise<string> {
    return new Promise(async (resolve, reject) => {
        if (!options?.proxies || options.proxies.length === 0) {
            let cookies_added = false;
            if (options.cookies) {
                let cook = getCookies();
                if (typeof cook === 'string' && options.headers) {
                    Object.assign(options.headers, { cookie: cook });
                    cookies_added = true;
                }
            }
            let res = await https_getter(req_url, options).catch((err: Error) => err);
            if (res instanceof Error) {
                reject(res);
                return;
            }
            if (res.headers && res.headers['set-cookie'] && cookies_added) {
                cookieHeaders(res.headers['set-cookie']);
            }
            if (Number(res.statusCode) >= 300 && Number(res.statusCode) < 400) {
                res = await https_getter(res.headers.location as string, options);
            } else if (Number(res.statusCode) > 400) {
                reject(new Error(`Got ${res.statusCode} from the request`));
            }
            const data: string[] = [];
            res.setEncoding('utf-8');
            res.on('data', (c) => data.push(c));
            res.on('end', () => resolve(data.join('')));
        } else {
            let cookies_added = false;
            if (options.cookies) {
                let cook = getCookies();
                if (typeof cook === 'string' && options.headers) {
                    Object.assign(options.headers, { cookie: cook });
                    cookies_added = true;
                }
            }
            let res = await proxy_getter(req_url, options.proxies, options.headers).catch((e: Error) => e);
            if (res instanceof Error) {
                reject(res);
                return;
            }
            if (res.headers && (res.headers as any)['set-cookie'] && cookies_added) {
                cookieHeaders((res.headers as any)['set-cookie']);
            }
            if (res.statusCode >= 300 && res.statusCode < 400) {
                res = await proxy_getter((res.headers as any)['location'], options.proxies, options.headers);
            } else if (res.statusCode > 400) {
                reject(new Error(`GOT ${res.statusCode} from proxy request`));
            }
            resolve(res.body);
        }
    });
}

export function request_resolve_redirect(url: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
        let res = await https_getter(url, { method: 'HEAD' }).catch((err: Error) => err);
        if (res instanceof Error) {
            reject(res);
            return;
        }
        const statusCode = Number(res.statusCode);
        if (statusCode < 300) {
            resolve(url);
        } else if (statusCode < 400) {
            const resolved = await request_resolve_redirect(res.headers.location as string).catch((err) => err);

            if (res instanceof Error) {
                reject(res);
                return;
            }

            resolve(resolved);
        } else {
            reject(new Error(`${res.statusCode}: ${res.statusMessage}, ${url}`));
        }
    });
}

/**
 * Chooses one random number between max and min number.
 * @param min Minimum number
 * @param max Maximum number
 * @returns Random Number
 */
function randomIntFromInterval(min: number, max: number): number {
    let x = Math.floor(Math.random() * (max - min + 1) + min);
    if (x === 0) return 0;
    else return x - 1;
}
/**
 * Main module that play-dl uses for proxy.
 * @param req_url URL to make https request to
 * @param req_proxy Proxies array
 * @returns Object with statusCode, head and body
 */
function proxy_getter(req_url: string, req_proxy: ProxyOptions[], headers?: Object): Promise<Proxy> {
    return new Promise((resolve, reject) => {
        const proxy: string | ProxyOpts = req_proxy[randomIntFromInterval(0, req_proxy.length)];
        const parsed_url = new URL(req_url);
        let opts: ProxyOpts;
        if (typeof proxy === 'string') {
            const parsed = new URL(proxy);
            opts = {
                host: parsed.hostname,
                port: Number(parsed.port),
                authentication: {
                    username: parsed.username,
                    password: parsed.password
                }
            };
        } else
            opts = {
                host: proxy.host,
                port: Number(proxy.port)
            };
        let req: ClientRequest;
        if (!opts.authentication) {
            req = http.request({
                host: opts.host,
                port: opts.port,
                method: 'CONNECT',
                path: `${parsed_url.host}:443`
            });
        } else {
            req = http.request({
                host: opts.host,
                port: opts.port,
                method: 'CONNECT',
                path: `${parsed_url.host}:443`,
                headers: {
                    'Proxy-Authorization': `Basic ${Buffer.from(
                        `${opts.authentication?.username}:${opts.authentication?.password}`
                    ).toString('base64')}`
                }
            });
        }
        req.on('connect', async function (res, socket) {
            const conn_proxy = new Proxy(parsed_url, { method: 'GET', socket: socket, headers: headers });
            await conn_proxy.fetch();
            socket.end();
            resolve(conn_proxy);
        });
        req.on('error', (e: Error) => reject(e));
        req.end();
    });
}

/**
 * Main module that play-dl uses for making a https request
 * @param req_url URL to make https request to
 * @param options Request options for https request
 * @returns Incoming Message from the https request
 */
function https_getter(req_url: string, options: RequestOpts = {}): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
        const s = new URL(req_url);
        options.method ??= 'GET';
        const req_options: RequestOptions = {
            host: s.hostname,
            path: s.pathname + s.search,
            headers: options.headers ?? {},
            method: options.method
        };

        const req = https.request(req_options, resolve);
        req.on('error', (err) => {
            reject(err);
        });
        if (options.method === 'POST') req.write(options.body);
        req.end();
    });
}
