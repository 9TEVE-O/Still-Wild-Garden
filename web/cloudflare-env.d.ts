declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STILLWILD_TICK_TOKEN?: string;
  }
}
