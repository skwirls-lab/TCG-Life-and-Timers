// @req AUTH-001
import { describe, expect, it } from "vitest";
import { authDomainFor } from "./config";

const env = (same?: string) => ({
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "tcgtempo.firebaseapp.com",
  NEXT_PUBLIC_AUTH_SAME_ORIGIN: same,
});
const at = (host: string) => ({ host, hostname: host.split(":")[0]! });

describe("authDomainFor (same-origin sign-in handler)", () => {
  it("uses the configured firebaseapp.com domain unless the flag is on", () => {
    expect(authDomainFor(env(), at("tcgtempo.skwirls.com"))).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor(env("0"), at("tcgtempo.skwirls.com"))).toBe("tcgtempo.firebaseapp.com");
  });
  it("with the flag on, uses the app's own host (proxied /__/auth)", () => {
    expect(authDomainFor(env("1"), at("tcgtempo.skwirls.com"))).toBe("tcgtempo.skwirls.com");
    expect(authDomainFor(env("1"), at("app--tcgtempo.us-central1.hosted.app"))).toBe(
      "app--tcgtempo.us-central1.hosted.app",
    );
  });
  it("keeps the configured domain on local hosts, on the server, and without a domain", () => {
    expect(authDomainFor(env("1"), at("localhost:3000"))).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor(env("1"), at("127.0.0.1:3100"))).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor(env("1"))).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor({ NEXT_PUBLIC_AUTH_SAME_ORIGIN: "1" }, at("x.app"))).toBe("");
  });
});
