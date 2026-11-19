// @req AUTH-001
import { describe, expect, it } from "vitest";
import { authDomainFor, authEnv, hostList, sameOriginAuth } from "./authDomain";

const env = (extra: Record<string, string | undefined> = {}) => ({
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "tcgtempo.firebaseapp.com",
  ...extra,
});
const at = (host: string) => ({ host, hostname: host.split(":")[0]! });

describe("authDomainFor (same-origin sign-in handler on Firebase Hosting)", () => {
  it("uses the app's own host on the site's Hosting domains", () => {
    expect(authDomainFor(env(), at("tcgtempo.web.app"))).toBe("tcgtempo.web.app");
    expect(authDomainFor(env(), at("tcgtempo.firebaseapp.com"))).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor(env(), at("TCGtempo.Web.App"))).toBe("TCGtempo.Web.App");
  });

  it("keeps the configured domain on preview channels (redirect URI not registered)", () => {
    expect(authDomainFor(env(), at("tcgtempo--pr-12-abc123.web.app"))).toBe(
      "tcgtempo.firebaseapp.com",
    );
  });

  it("uses a custom domain only when it is listed", () => {
    expect(authDomainFor(env(), at("tcgtempo.skwirls.com"))).toBe("tcgtempo.firebaseapp.com");
    const listed = env({ NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS: " other.app, TCGtempo.skwirls.com " });
    expect(authDomainFor(listed, at("tcgtempo.skwirls.com"))).toBe("tcgtempo.skwirls.com");
    expect(authDomainFor(listed, at("evil.example"))).toBe("tcgtempo.firebaseapp.com");
    // look-alike suffixes are not Hosting domains
    expect(authDomainFor(env(), at("tcgtempo.web.app.evil.example"))).toBe(
      "tcgtempo.firebaseapp.com",
    );
  });

  it("NEXT_PUBLIC_AUTH_SAME_ORIGIN=1 still means any host", () => {
    expect(authDomainFor(env({ NEXT_PUBLIC_AUTH_SAME_ORIGIN: "1" }), at("x.example:8443"))).toBe(
      "x.example:8443",
    );
    expect(authDomainFor(env({ NEXT_PUBLIC_AUTH_SAME_ORIGIN: "0" }), at("x.example"))).toBe(
      "tcgtempo.firebaseapp.com",
    );
  });

  it("keeps the configured domain on local hosts, on the server, and without a domain", () => {
    const all = env({ NEXT_PUBLIC_AUTH_SAME_ORIGIN: "1" });
    expect(authDomainFor(all, at("localhost:3000"))).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor(all, at("127.0.0.1:3100"))).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor(all)).toBe("tcgtempo.firebaseapp.com");
    expect(authDomainFor({ NEXT_PUBLIC_AUTH_SAME_ORIGIN: "1" }, at("tcgtempo.web.app"))).toBe("");
  });

  it("sameOriginAuth: true where the handler is on the app's own host", () => {
    expect(sameOriginAuth(env(), at("tcgtempo.web.app"))).toBe(true);
    expect(sameOriginAuth(env(), at("tcgtempo.firebaseapp.com"))).toBe(true);
    expect(sameOriginAuth(env(), at("tcgtempo.skwirls.com"))).toBe(false);
    expect(
      sameOriginAuth(
        env({ NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS: "tcgtempo.skwirls.com" }),
        at("tcgtempo.skwirls.com"),
      ),
    ).toBe(true);
    expect(sameOriginAuth(env(), at("localhost:3000"))).toBe(false);
    expect(sameOriginAuth(env(), undefined)).toBe(false);
  });

  it("reads its env literally", () => {
    expect(Object.keys(authEnv())).toEqual([
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_AUTH_SAME_ORIGIN",
      "NEXT_PUBLIC_AUTH_SAME_ORIGIN_HOSTS",
    ]);
  });

  it("parses the host list", () => {
    expect(hostList(undefined)).toEqual([]);
    expect(hostList("")).toEqual([]);
    expect(hostList("A.com, ,b.com")).toEqual(["a.com", "b.com"]);
  });
});
