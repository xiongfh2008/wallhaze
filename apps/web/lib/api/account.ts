/** Credentialed backend adapter. Missing API configuration returns unavailable. */

import { apiRequest, resolveApiBaseUrl, type ApiResult } from "./client";

/** Proposed account profile (not yet a backend contract). */
export interface AccountProfile {
  userId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
}

/** Proposed language preference update. */
export interface LanguagePreferenceUpdate {
  /** One of the supported locales (i18n/routing). */
  locale: string;
}

/**
 * Service gate. Flipping this is part of the future User API integration —
 * never from UI code.
 */
export const ACCOUNT_SERVICES_CONFIGURED = Boolean(resolveApiBaseUrl());


export interface AccountAdapter {
  getAccount(): Promise<ApiResult<AccountProfile>>;
  /** Reserved: per-account language preference (server-side storage). */
  updateLanguagePreference(
    update: LanguagePreferenceUpdate
  ): Promise<ApiResult<AccountProfile>>;
  /**
   * Reserved: real account deletion. Only ever triggered by an explicit,
   * confirmed user action AFTER the reviewed Privacy Policy defines the
   * exact removal scope.
   */
  deleteAccount(): Promise<ApiResult<null>>;
}

class GatedAccountAdapter implements AccountAdapter {
  async getAccount(): Promise<ApiResult<AccountProfile>> {
    return apiRequest("/v1/account");
  }

  async updateLanguagePreference(
    _update: LanguagePreferenceUpdate
  ): Promise<ApiResult<AccountProfile>> {
    return apiRequest("/v1/account/language", { method: "POST", body: _update });
  }

  async deleteAccount(): Promise<ApiResult<null>> {
    return apiRequest("/v1/account/deletion-request", { method: "POST", body: {} });
  }
}

/** App-wide singleton. Tests may construct their own GatedAccountAdapter. */
export const accountAdapter: AccountAdapter = new GatedAccountAdapter();
