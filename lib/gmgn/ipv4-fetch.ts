import axios from 'axios';
import dns from 'node:dns';
import https from 'node:https';

/** GMGN OpenAPI refuse IPv6 — ordre DNS global + agent HTTPS IPv4 uniquement. */
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const httpsAgent = new https.Agent({ family: 4, keepAlive: true });

export interface GmgnHttpsResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/**
 * GET HTTPS vers GMGN en IPv4 (évite « OpenAPI does not support IPv6 »).
 * Utilise axios + `https.Agent({ family: 4 })` (sans `lookup` custom, source d’erreurs « Invalid IP address: undefined » sur Node récents).
 */
export async function gmgnFetchHttps(
  urlStr: string,
  headers: Record<string, string>
): Promise<GmgnHttpsResponse> {
  const res = await axios.get<string>(urlStr, {
    headers,
    httpsAgent,
    proxy: false,
    validateStatus: () => true,
    responseType: 'text',
    timeout: 120_000,
  });

  const body = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text: async () => body,
  };
}
