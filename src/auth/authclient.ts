// Copyright 2012 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {EventEmitter} from 'events';
import {Gaxios, GaxiosOptions, GaxiosPromise, GaxiosResponse} from 'gaxios';

import {DefaultTransporter, Transporter} from '../transporters';
import {Credentials} from './credentials';
import {GetAccessTokenResponse, Headers} from './oauth2client';
import {OriginalAndCamel, originalOrCamelOptions} from '../util';

/**
 * Base auth configurations (e.g. from JWT or `.json` files) with conventional
 * camelCased options.
 *
 * @privateRemarks
 *
 * This interface is purposely not exported so that it can be removed once
 * {@link https://github.com/microsoft/TypeScript/issues/50715} has been
 * resolved. Then, we can use {@link OriginalAndCamel} to shrink this interface.
 *
 * Tracking: {@link https://github.com/googleapis/google-auth-library-nodejs/issues/1686}
 */
interface AuthJSONOptions {
  /**
   * The project ID corresponding to the current credentials if available.
   */
  project_id: string | null;
  /**
   * An alias for {@link AuthJSONOptions.project_id `project_id`}.
   */
  projectId: AuthJSONOptions['project_id'];

  /**
   * The quota project ID. The quota project can be used by client libraries for the billing purpose.
   * See {@link https://cloud.google.com/docs/quota Working with quotas}
   */
  quota_project_id: string;

  /**
   * An alias for {@link AuthJSONOptions.quota_project_id `quota_project_id`}.
   */
  quotaProjectId: AuthJSONOptions['quota_project_id'];

  /**
   * The default service domain for a given Cloud universe.
   */
  universe_domain: string;

  /**
   * An alias for {@link AuthJSONOptions.universe_domain `universe_domain`}.
   */
  universeDomain: AuthJSONOptions['universe_domain'];
}

/**
 * Base `AuthClient` configuration.
 *
 * The camelCased options are aliases of the snake_cased options, supporting both
 * JSON API and JS conventions.
 */
export interface AuthClientOptions
  extends Partial<OriginalAndCamel<AuthJSONOptions>> {
  /**
   * An API key to use, optional.
   */
  apiKey?: string;
  credentials?: Credentials;

  /**
   * A `Gaxios` or `Transporter` instance to use for `AuthClient` requests.
   */
  transporter?: Gaxios | Transporter;

  /**
   * Provides default options to the transporter, such as {@link GaxiosOptions.agent `agent`} or
   *  {@link GaxiosOptions.retryConfig `retryConfig`}.
   */
  transporterOptions?: GaxiosOptions;

  /**
   * The expiration threshold in milliseconds before forcing token refresh of
   * unexpired tokens.
   */
  eagerRefreshThresholdMillis?: number;

  /**
   * Whether to attempt to refresh tokens on status 401/403 responses
   * even if an attempt is made to refresh the token preemptively based
   * on the expiry_date.
   */
  forceRefreshOnFailure?: boolean;
}

/**
 * The default cloud universe
 *
 * @see {@link AuthJSONOptions.universe_domain}
 */
export const DEFAULT_UNIVERSE = 'googleapis.com';

/**
 * The default {@link AuthClientOptions.eagerRefreshThresholdMillis}
 */
export const DEFAULT_EAGER_REFRESH_THRESHOLD_MILLIS = 5 * 60 * 1000;

/**
 * Defines the root interface for all clients that generate credentials
 * for calling Google APIs. All clients should implement this interface.
 */
export interface CredentialsClient {
  projectId?: AuthClientOptions['projectId'];
  eagerRefreshThresholdMillis: NonNullable<
    AuthClientOptions['eagerRefreshThresholdMillis']
  >;
  forceRefreshOnFailure: NonNullable<
    AuthClientOptions['forceRefreshOnFailure']
  >;

  /**
   * @return A promise that resolves with the current GCP access token
   *   response. If the current credential is expired, a new one is retrieved.
   */
  getAccessToken(): Promise<GetAccessTokenResponse>;

  /**
   * The main authentication interface. It takes an optional url which when
   * present is the endpoint being accessed, and returns a Promise which
   * resolves with authorization header fields.
   *
   * The result has the form:
   * { Authorization: 'Bearer <access_token_value>' }
   * @param url The URI being authorized.
   */
  getRequestHeaders(url?: string): Promise<Headers>;

  /**
   * Provides an alternative Gaxios request implementation with auth credentials
   */
  request<T>(opts: GaxiosOptions): GaxiosPromise<T>;

  /**
   * Sets the auth credentials.
   */
  setCredentials(credentials: Credentials): void;

  /**
   * Subscribes a listener to the tokens event triggered when a token is
   * generated.
   *
   * @param event The tokens event to subscribe to.
   * @param listener The listener that triggers on event trigger.
   * @return The current client instance.
   */
  on(event: 'tokens', listener: (tokens: Credentials) => void): this;
}

export declare interface AuthClient {
  on(event: 'tokens', listener: (tokens: Credentials) => void): this;
}

export abstract class AuthClient
  extends EventEmitter
  implements CredentialsClient
{
  apiKey?: string;
  projectId?: string | null;
  /**
   * The quota project ID. The quota project can be used by client libraries for the billing purpose.
   * See {@link https://cloud.google.com/docs/quota Working with quotas}
   */
  quotaProjectId?: string;
  transporter: Transporter;
  credentials: Credentials = {};
  eagerRefreshThresholdMillis = DEFAULT_EAGER_REFRESH_THRESHOLD_MILLIS;
  forceRefreshOnFailure = false;
  universeDomain = DEFAULT_UNIVERSE;

  /**
   * The type of credential.
   *
   * @see {@link AuthClient.CREDENTIAL_TYPES}
   */
  readonly credentialType?: keyof typeof AuthClient.CREDENTIAL_TYPES;

  constructor(opts: AuthClientOptions = {}) {
    super();

    const options = originalOrCamelOptions(opts);

    // Shared auth options
    this.apiKey = opts.apiKey;
    this.projectId = options.get('project_id') ?? null;
    this.quotaProjectId = options.get('quota_project_id');
    this.credentials = options.get('credentials') ?? {};
    this.universeDomain = options.get('universe_domain') ?? DEFAULT_UNIVERSE;

    // Shared client options
    this.transporter = opts.transporter ?? new DefaultTransporter();

    if (opts.transporterOptions) {
      this.transporter.defaults = opts.transporterOptions;
    }

    if (opts.eagerRefreshThresholdMillis) {
      this.eagerRefreshThresholdMillis = opts.eagerRefreshThresholdMillis;
    }

    this.forceRefreshOnFailure = opts.forceRefreshOnFailure ?? false;
  }

  /**
   * Return the {@link Gaxios `Gaxios`} instance from the {@link AuthClient.transporter}.
   *
   * @expiremental
   */
  get gaxios(): Gaxios | null {
    if (this.transporter instanceof Gaxios) {
      return this.transporter;
    } else if (this.transporter instanceof DefaultTransporter) {
      return this.transporter.instance;
    } else if (
      'instance' in this.transporter &&
      this.transporter.instance instanceof Gaxios
    ) {
      return this.transporter.instance;
    }

    return null;
  }

  /**
   * The public request API in which credentials may be added to the request.
   *
   * @param options options for `gaxios`
   */
  abstract request<T>(options: GaxiosOptions): GaxiosPromise<T>;

  /**
   * The internal request handler. At this stage the credentials have been created, but
   * the standard headers have not been added until this call.
   *
   * @param options options for `gaxios`
   */
  protected _request<T>(options: GaxiosOptions): GaxiosPromise<T> {
    if (!options.headers?.['x-goog-api-client']) {
      options.headers = options.headers || {};
      const nodeVersion = process.version.replace(/^v/, '');
      options.headers['x-goog-api-client'] = `gl-node/${nodeVersion}`;
    }

    if (this.credentialType) {
      options.headers['x-goog-api-client'] =
        options.headers['x-goog-api-client'] +
        ` cred-type/${this.credentialType}`;
    }

    return this.transporter.request<T>(options);
  }

  /**
   * The main authentication interface. It takes an optional url which when
   * present is the endpoint being accessed, and returns a Promise which
   * resolves with authorization header fields.
   *
   * The result has the form:
   * { Authorization: 'Bearer <access_token_value>' }
   * @param url The URI being authorized.
   */
  abstract getRequestHeaders(url?: string): Promise<Headers>;

  /**
   * @return A promise that resolves with the current GCP access token
   *   response. If the current credential is expired, a new one is retrieved.
   */
  abstract getAccessToken(): Promise<{
    token?: string | null;
    res?: GaxiosResponse | null;
  }>;

  /**
   * Sets the auth credentials.
   */
  setCredentials(credentials: Credentials) {
    this.credentials = credentials;
  }

  /**
   * Append additional headers, e.g., x-goog-user-project, shared across the
   * classes inheriting AuthClient. This method should be used by any method
   * that overrides getRequestMetadataAsync(), which is a shared helper for
   * setting request information in both gRPC and HTTP API calls.
   *
   * @param headers object to append additional headers to.
   */
  protected addSharedMetadataHeaders(headers: Headers): Headers {
    // quota_project_id, stored in application_default_credentials.json, is set in
    // the x-goog-user-project header, to indicate an alternate account for
    // billing and quota:
    if (
      !headers['x-goog-user-project'] && // don't override a value the user sets.
      this.quotaProjectId
    ) {
      headers['x-goog-user-project'] = this.quotaProjectId;
    }
    return headers;
  }

  /**
   * An enum of the known credential types
   */
  protected static CREDENTIAL_TYPES = {
    /** for gcloud user credential (auth code flow and refresh flow) */
    u: 'u',
    /** service account credential with assertion token flow */
    sa: 'sa',
    /** service account credential with self signed jwt token flow */
    jwt: 'jwt',
    /** service account credential attached to metadata server, i.e. VM credential */
    mds: 'mds',
    /** impersonated credential */
    imp: 'imp',
  } as const;

  /**
   * Retry config for Auth-related requests.
   *
   * @remarks
   *
   * This is not a part of the default {@link AuthClient.transporter transporter/gaxios}
   * config as some downstream APIs would prefer if customers explicitly enable retries,
   * such as GCS.
   */
  protected static get RETRY_CONFIG(): GaxiosOptions {
    return {
      retry: true,
      retryConfig: {
        httpMethodsToRetry: ['GET', 'PUT', 'POST', 'HEAD', 'OPTIONS', 'DELETE'],
      },
    };
  }
}
