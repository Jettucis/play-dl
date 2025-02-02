import fs from 'node:fs';

let youtubeData: youtubeDataOptions;
if (fs.existsSync('.data/youtube.data')) {
    youtubeData = JSON.parse(fs.readFileSync('.data/youtube.data').toString());
    youtubeData.file = true;
}

interface youtubeDataOptions {
    cookie?: Object;
    file?: boolean;
}

export function getCookies(): undefined | string {
    let result = '';
    if (!youtubeData?.cookie) return undefined;
    for (const [key, value] of Object.entries(youtubeData.cookie)) {
        result += `${key}=${value};`;
    }
    return result;
}

export function setCookie(key: string, value: string): boolean {
    if (!youtubeData?.cookie) return false;
    key = key.trim();
    value = value.trim();
    Object.assign(youtubeData.cookie, { [key]: value });
    return true;
}

export function uploadCookie() {
    if (youtubeData.cookie && youtubeData.file)
        fs.writeFileSync('.data/youtube.data', JSON.stringify(youtubeData, undefined, 4));
}

export function setCookieToken(options: { cookie: string }) {
    let cook = options.cookie;
    let cookie: Object = {};
    cook.split(';').forEach((x) => {
        const arr = x.split('=');
        if (arr.length <= 1) return;
        const key = arr.shift()?.trim() as string;
        const value = arr.join('=').trim();
        Object.assign(cookie, { [key]: value });
    });
    youtubeData = { cookie };
    youtubeData.file = false;
}

export function cookieHeaders(headCookie: string[]) {
    if (!youtubeData?.cookie) return;
    headCookie.forEach((x: string) => {
        x.split(';').forEach((x) => {
            const arr = x.split('=');
            if (arr.length <= 1) return;
            const key = arr.shift()?.trim() as string;
            const value = arr.join('=').trim();
            setCookie(key, value);
        });
    });
    uploadCookie();
}
