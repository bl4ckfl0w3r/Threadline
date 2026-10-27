declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    AUTH_MODE?: 'browser-session' | 'cloudflare-access';
    SESSION_SIGNING_KEY?: string;
    RELEASE_SHA?: string;
  }
}
