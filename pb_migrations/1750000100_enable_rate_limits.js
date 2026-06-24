/// <reference path="../pb_data/types.d.ts" />

// Enables PocketBase's built-in (IP-based, token-bucket) rate limiter with
// brute-force-resistant rules. The auth rule is intentionally strict: only a
// few login attempts per IP per minute. Tune in Dashboard > Settings if needed.
migrate(
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
      // Tight cap on authentication endpoints -> blocks password brute force.
      { label: "*:auth", maxRequests: 5, duration: 60, audience: "" },
      // Default-style caps for the rest of the API.
      { label: "*:create", maxRequests: 20, duration: 5, audience: "" },
      { label: "/api/batch", maxRequests: 3, duration: 1, audience: "" },
      { label: "/api/", maxRequests: 300, duration: 10, audience: "" },
    ];
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = false;
    app.save(settings);
  }
);
