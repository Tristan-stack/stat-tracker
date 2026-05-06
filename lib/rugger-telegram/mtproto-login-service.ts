import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import {
  decryptTelegramSessionString,
  encryptTelegramSessionString,
  TelegramSessionDecryptError,
  TelegramSessionMasterKeyError,
} from '@/lib/crypto/telegram-session-crypto';
import { query } from '@/lib/db';
import { requireTelegramAppCredentials } from '@/lib/telegram/client';
import { maskedPhoneHint } from '@/lib/rugger-telegram/mtproto-phone';

/** Durée de validité du `phoneCodeHash` côté app (Telegram impose aussi sa propre limite). */
export const MTPROTO_LOGIN_CHALLENGE_TTL_MS = 15 * 60 * 1000;
export const SENDCODE_MAX_ATTEMPTS_PER_HOUR = 3;

async function disposeClient(client?: TelegramClient) {
  if (!client) return;
  try {
    await client.disconnect();
  } catch {
    // ignore
  }
}

async function rollingSendcodeCountLastHour(userId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as count from telegram_mtproto_sendcode_logs
     where user_id = $1 and created_at > now() - interval '1 hour'`,
    [userId]
  );
  const n = Number(rows[0]?.count ?? '0');
  return Number.isFinite(n) ? n : 0;
}

function getTelegramRpcErrorMessage(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'errorMessage' in e) {
    const m = (e as { errorMessage?: unknown }).errorMessage;
    return typeof m === 'string' ? m : undefined;
  }
  return undefined;
}

function isSessionPasswordNeeded(e: unknown): boolean {
  return getTelegramRpcErrorMessage(e) === 'SESSION_PASSWORD_NEEDED';
}

export type MtprotoLoginSendCodeOutcome =
  | { ok: true }
  | { ok: false; httpStatus: number; clientMessage: string; code?: string };

export async function mtprotoLoginSendCode(userId: string, phoneE164: string): Promise<MtprotoLoginSendCodeOutcome> {
  const count = await rollingSendcodeCountLastHour(userId);
  if (count >= SENDCODE_MAX_ATTEMPTS_PER_HOUR) {
    return {
      ok: false,
      httpStatus: 429,
      code: 'sendcode_rate_limited',
      clientMessage:
        'Trop de codes envoyés depuis une heure. Réessaie plus tard.',
    };
  }

  const creds = requireTelegramAppCredentials();
  const session = new StringSession('');
  const client = new TelegramClient(session, creds.apiId, creds.apiHash, {
    connectionRetries: 5,
    requestRetries: 2,
    deviceModel: 'StatTrackerMtprotoLogin',
    appVersion: '1.0',
  });

  await client.connect();
  try {
    const { phoneCodeHash } = await client.sendCode(
      {
        apiId: creds.apiId,
        apiHash: creds.apiHash,
      },
      phoneE164
    );

    const pendingPlain =
      typeof session.save === 'function' ? session.save() : '';
    if (!pendingPlain) {
      return {
        ok: false,
        httpStatus: 500,
        code: 'pending_session_empty',
        clientMessage:
          'Échec interne après envoi du code. Réessaie dans une minute.',
      };
    }

    let pendingEnc: string;
    try {
      pendingEnc = encryptTelegramSessionString(pendingPlain);
    } catch (err) {
      const msg =
        err instanceof TelegramSessionMasterKeyError
          ? err.message
          : 'Chiffrement impossible.';
      return {
        ok: false,
        httpStatus: err instanceof TelegramSessionMasterKeyError ? 503 : 500,
        code: 'encrypt_pending_failed',
        clientMessage: msg,
      };
    }

    const expiresAtIso = new Date(Date.now() + MTPROTO_LOGIN_CHALLENGE_TTL_MS).toISOString();

    await query(`delete from telegram_mtproto_login_challenges where user_id = $1`, [userId]);

    await query(
      `insert into telegram_mtproto_login_challenges (
         user_id, phone_e164, phone_code_hash, encrypted_pending_session, expires_at
       ) values ($1, $2, $3, $4, $5::timestamptz)`,
      [userId, phoneE164, phoneCodeHash, pendingEnc, expiresAtIso]
    );

    await query(`insert into telegram_mtproto_sendcode_logs (user_id) values ($1)`, [userId]);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === 'string' ? e : 'telegram_sendcode_failed';
    return {
      ok: false,
      httpStatus: 400,
      code: 'telegram_sendcode_failed',
      clientMessage:
        msg.length > 0 && msg.length < 280
          ? msg
          : 'Impossible d’envoyer le code Telegram.',
    };
  } finally {
    await disposeClient(client);
  }

  return { ok: true };
}

export type MtprotoLoginCompleteOutcome =
  | { ok: true; phoneHint: string }
  | { ok: false; httpStatus: number; clientMessage: string; code?: string };

export async function mtprotoLoginComplete(
  userId: string,
  phoneCodeTrimmed: string,
  twoFactorPassword: string | undefined
): Promise<MtprotoLoginCompleteOutcome> {
  const rows = await query<{
    phone_e164: string;
    phone_code_hash: string;
    encrypted_pending_session: string | null;
  }>(
    `select phone_e164, phone_code_hash, encrypted_pending_session
     from telegram_mtproto_login_challenges
     where user_id = $1 and expires_at > now()`,
    [userId]
  );
  const ch = rows[0];
  if (!ch) {
    const stale = await query<{ c: string }>(
      `select count(*)::text as c from telegram_mtproto_login_challenges where user_id = $1`,
      [userId]
    );
    const hadStale = Number(stale[0]?.c ?? '0') > 0;
    if (hadStale) {
      await query(`delete from telegram_mtproto_login_challenges where user_id = $1`, [userId]);
      return {
        ok: false,
        httpStatus: 400,
        code: 'challenge_expired',
        clientMessage:
          'La fenêtre de connexion a expiré (15 min) ou le code ne correspond plus. Demande un nouveau code Telegram.',
      };
    }
    return {
      ok: false,
      httpStatus: 400,
      code: 'no_login_challenge',
      clientMessage:
        'Aucune demande de code active. Rentre ton numéro et envoie un nouveau code.',
    };
  }

  if (
    typeof ch.encrypted_pending_session !== 'string' ||
    ch.encrypted_pending_session.length === 0
  ) {
    await query(`delete from telegram_mtproto_login_challenges where user_id = $1`, [userId]);
    return {
      ok: false,
      httpStatus: 400,
      code: 'pending_session_missing',
      clientMessage:
        'Session d’envoi de code obsolète (mise à jour serveur). Demande un nouveau code Telegram.',
    };
  }

  let pendingPlain: string;
  try {
    pendingPlain = decryptTelegramSessionString(ch.encrypted_pending_session);
  } catch (err) {
    await query(`delete from telegram_mtproto_login_challenges where user_id = $1`, [userId]);
    const isDecrypt = err instanceof TelegramSessionDecryptError;
    return {
      ok: false,
      httpStatus: isDecrypt ? 400 : 500,
      code: isDecrypt ? 'pending_session_corrupt' : 'decrypt_failed',
      clientMessage: isDecrypt
        ? 'Données de connexion illisibles. Demande un nouveau code.'
        : 'Erreur serveur. Réessaie plus tard.',
    };
  }

  const creds = requireTelegramAppCredentials();
  const session = new StringSession(pendingPlain);
  const client = new TelegramClient(session, creds.apiId, creds.apiHash, {
    connectionRetries: 5,
    requestRetries: 2,
    deviceModel: 'StatTrackerMtprotoLogin',
    appVersion: '1.0',
  });

  await client.connect();
  try {
    let signupRequired = false;
    try {
      const authResult = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: ch.phone_e164,
          phoneCodeHash: ch.phone_code_hash,
          phoneCode: phoneCodeTrimmed,
        })
      );
      if (authResult instanceof Api.auth.AuthorizationSignUpRequired) signupRequired = true;
    } catch (e) {
      if (isSessionPasswordNeeded(e)) {
        const pwd =
          typeof twoFactorPassword === 'string' ? twoFactorPassword.trim() : '';
        if (!pwd) {
          return {
            ok: false,
            httpStatus: 400,
            code: 'two_factor_required',
            clientMessage:
              'Ce compte Telegram a une authentification à deux facteurs : renvoie ce formulaire avec le même code ET le mot de passe 2FA.',
          };
        }
        try {
          await client.signInWithPassword(
            {
              apiId: creds.apiId,
              apiHash: creds.apiHash,
            },
            {
              password: async () => pwd,
              onError: async (err: Error) => {
                throw err;
              },
            }
          );
        } catch {
          return {
            ok: false,
            httpStatus: 400,
            code: 'two_factor_failed',
            clientMessage: 'Mot de passe 2FA incorrect. Réessaie avec un nouveau code si besoin.',
          };
        }
        signupRequired = false;
      } else {
        const rpcMsg = getTelegramRpcErrorMessage(e);
        if (process.env.NODE_ENV === 'development' && rpcMsg) {
          console.warn('[mtproto-login] SignIn RPC', rpcMsg);
        }
        const hint =
          rpcMsg === 'PHONE_CODE_EXPIRED' || rpcMsg === 'PHONE_CODE_INVALID'
            ? 'Code incorrect ou déjà utilisé. Demande un nouveau code puis réessaie.'
            : rpcMsg === 'PHONE_CODE_HASH_EMPTY' || rpcMsg === 'PHONE_CODE_HASH_INVALID'
              ? 'Le code ne correspond plus à cette demande. Renvoie un nouveau code.'
              : 'Code invalide ou expiré. Demande un nouveau code puis réessaie.';
        return {
          ok: false,
          httpStatus: 400,
          code: 'sign_in_failed',
          clientMessage: hint,
        };
      }
    }

    if (signupRequired) {
      await query(`delete from telegram_mtproto_login_challenges where user_id = $1`, [userId]);
      return {
        ok: false,
        httpStatus: 400,
        code: 'telegram_signup_required',
        clientMessage:
          'Ce numéro n’a pas encore de compte Telegram : crée-le dans l’app officielle puis reviens connecter depuis StatTracker.',
      };
    }

    const authorized = await client.checkAuthorization();
    if (!authorized) {
      return {
        ok: false,
        httpStatus: 400,
        code: 'session_not_authorized',
        clientMessage:
          'Connexion Telegram incomplète. Vérifie le code ou redemande-en un nouveau.',
      };
    }

    const rawSession = typeof session.save === 'function' ? session.save() : '';
    if (!rawSession) {
      return {
        ok: false,
        httpStatus: 500,
        clientMessage:
          'Session Telegram créée mais non sérialisable. Réessaie la connexion.',
      };
    }

    let cipher: string;
    try {
      cipher = encryptTelegramSessionString(rawSession);
    } catch (err) {
      const msg =
        err instanceof TelegramSessionMasterKeyError
          ? err.message
          : 'Chiffrement de session impossible.';
      return {
        ok: false,
        httpStatus: err instanceof TelegramSessionMasterKeyError ? 503 : 500,
        clientMessage: msg,
      };
    }

    const phoneHint = maskedPhoneHint(ch.phone_e164);
    await query(
      `insert into telegram_mtproto_sessions (user_id, encrypted_payload, phone_hint)
       values ($1, $2, $3)
       on conflict (user_id)
       do update set encrypted_payload = excluded.encrypted_payload, phone_hint = excluded.phone_hint,
         updated_at = now()`,
      [userId, cipher, phoneHint]
    );

    await query(`delete from telegram_mtproto_login_challenges where user_id = $1`, [userId]);

    return { ok: true, phoneHint };
  } finally {
    await disposeClient(client);
  }
}

export async function mtprotoSessionConnected(userId: string): Promise<{
  connected: boolean;
  phoneHint?: string;
}> {
  const rows = await query<{ encrypted_payload: string; phone_hint: string | null }>(
    `select encrypted_payload, phone_hint from telegram_mtproto_sessions where user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return { connected: false };
  const phoneHint =
    typeof row.phone_hint === 'string' && row.phone_hint.length > 0 ? row.phone_hint : undefined;
  return { connected: true, ...(phoneHint !== undefined ? { phoneHint } : {}) };
}

export async function mtprotoDeleteLoginAndSession(userId: string): Promise<void> {
  await query(`delete from telegram_mtproto_login_challenges where user_id = $1`, [userId]);
  await query(`delete from telegram_mtproto_sessions where user_id = $1`, [userId]);
}
