export const fetchOpenMeteo = async (url: string, options?: RequestInit) => {
  let res = await fetch(url, options);
  if (res.status === 429 || res.status === 403) {
    console.warn(`Open-Meteo ${res.status} hit, using corsproxy.io fallback...`);
    res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, options);
  }
  if (res.status === 429 || res.status === 403) {
    console.warn(`corsproxy.io ${res.status} hit, using codetabs fallback...`);
    res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, options);
  }
  if (res.status === 429 || res.status === 403 || res.status === 502) {
    console.warn(`codetabs ${res.status} hit, using thingproxy fallback...`);
    res = await fetch(`https://thingproxy.freeboard.io/fetch/${url}`, options);
  }
  if (res.status === 429 || res.status === 403 || res.status === 502) {
    console.warn(`thingproxy ${res.status} hit, using allorigins fallback...`);
    res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, options);
  }
  return res;
};
