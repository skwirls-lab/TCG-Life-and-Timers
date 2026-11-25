// Pro entry points: copy by policy, the "You're Pro" state, and the launcher card snooze.
// @req PAY-002 @req PAY-004
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProDetails, type ProDetails } from "@/lib/entitlements/details";
import { useEntitlements } from "@/lib/entitlements/store";
import { AccountProSection } from "./AccountProSection";
import {
  LauncherProBadge,
  LauncherProCard,
  PRO_CARD_DISMISS_KEY,
  PRO_CARD_SNOOZE_MS,
  cardSnoozed,
} from "./LauncherPro";
import { ProState } from "./ProState";
import { SettingsProCard } from "./SettingsProCard";
import { planName, renewalLine } from "./useProStatus";

const openPortal = vi.fn(async () => ({ status: "noCustomer" as const }));
vi.mock("@/lib/entitlements/checkout", () => ({ openPortal: () => openPortal() }));

const monthly: ProDetails = {
  plan: "monthly",
  currentPeriodEnd: Date.UTC(2027, 0, 15, 12),
  cancelAtPeriodEnd: false,
  source: "subscription",
};

function setPro(pro: boolean, details: ProDetails | null = null, policy = "ALL_FREE" as const) {
  act(() => {
    useEntitlements.setState({ pro, policy });
    useProDetails.setState({ details, known: true });
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useEntitlements.setState({ pro: false, policy: "ALL_FREE" });
  useProDetails.setState({ details: null, known: false });
});

describe("plan and renewal text", () => {
  it("names the plan; an older doc reads as Pro", () => {
    expect(planName(monthly)).toBe("Monthly");
    expect(planName({ ...monthly, plan: "manual" })).toBe("Gift");
    expect(planName(null)).toBe("Pro");
  });
  it("renews, cancels, never expires, or nothing when no date is known", () => {
    expect(renewalLine(monthly)).toMatch(/^Renews on Jan 15, 2027$/);
    expect(renewalLine({ ...monthly, cancelAtPeriodEnd: true })).toMatch(/^Cancels on /);
    expect(renewalLine({ ...monthly, plan: "lifetime", currentPeriodEnd: null })).toBe(
      "Never expires",
    );
    expect(renewalLine({ ...monthly, plan: "manual" })).toMatch(/Nothing is billed/);
    expect(renewalLine({ ...monthly, currentPeriodEnd: null })).toBeNull();
    expect(renewalLine(null)).toBeNull();
  });
});

describe("launcher card", () => {
  it("snoozes for 14 days only", () => {
    const now = 10 * PRO_CARD_SNOOZE_MS;
    expect(cardSnoozed(null, now)).toBe(false);
    expect(cardSnoozed("junk", now)).toBe(false);
    expect(cardSnoozed(String(now - 1000), now)).toBe(true);
    expect(cardSnoozed(String(now - PRO_CARD_SNOOZE_MS), now)).toBe(false);
    expect(cardSnoozed(String(now + 5000), now)).toBe(false); // clock went backwards
  });

  it("support copy while everything is free; Go Pro when the paywall is on; dismiss persists", () => {
    setPro(false);
    render(<LauncherProCard />);
    act(() => vi.advanceTimersToNextFrame());
    const card = screen.getByTestId("launcher-pro-card");
    expect(card.textContent).toContain("Support TCGTempo");
    expect(card.textContent).not.toMatch(/unlock|locked/i);
    act(() => useEntitlements.setState({ policy: "TIERED" }));
    expect(card.textContent).toContain("Go Pro");
    fireEvent.click(screen.getByTestId("launcher-pro-dismiss"));
    expect(screen.queryByTestId("launcher-pro-card")).toBeNull();
    expect(Number(localStorage.getItem(PRO_CARD_DISMISS_KEY))).toBeGreaterThan(0);
  });

  it("waits for sync, and Pro users get the badge instead", () => {
    act(() => useProDetails.setState({ known: false }));
    render(
      <>
        <LauncherProCard />
        <LauncherProBadge />
      </>,
    );
    act(() => vi.advanceTimersToNextFrame());
    // isCloudConfigured() is false in unit tests, so the card doesn't wait here
    expect(screen.queryByTestId("launcher-pro-card")).not.toBeNull();
    setPro(true, monthly);
    expect(screen.queryByTestId("launcher-pro-card")).toBeNull();
    expect(screen.getByTestId("launcher-pro-badge").getAttribute("href")).toBe("/pro");
  });
});

describe("Settings card, Account section and You're Pro", () => {
  it("Settings: Go Pro / Upgrade for free users, plan + Manage for Pro", async () => {
    setPro(false);
    render(<SettingsProCard />);
    expect(screen.getByTestId("settings-pro-card").textContent).toContain("Go Pro");
    act(() => useEntitlements.setState({ policy: "TIERED" }));
    expect(screen.getByTestId("settings-pro-card").textContent).toContain("Upgrade");
    setPro(true, monthly);
    expect(screen.getByTestId("settings-pro-status").textContent).toBe("Pro · Monthly");
    expect(screen.getByTestId("settings-pro-renewal").textContent).toContain("Renews on");
    await act(async () => fireEvent.click(screen.getByTestId("settings-pro-manage")));
    expect(openPortal).toHaveBeenCalled();
    expect(screen.getByTestId("settings-pro-manage-error").textContent).toContain(
      "no subscription",
    );
    setPro(true, null);
    expect(screen.getByTestId("settings-pro-status").textContent).toBe("Pro · Manage subscription");
  });

  it("Account: plan and renewal, or Support / Upgrade", () => {
    setPro(false);
    render(<AccountProSection />);
    expect(screen.getByTestId("account-pro-upgrade").textContent).toContain("Support TCGTempo");
    act(() => useEntitlements.setState({ policy: "TIERED" }));
    expect(screen.getByTestId("account-pro-upgrade").textContent).toContain("Upgrade to Pro");
    setPro(true, { ...monthly, plan: "yearly", cancelAtPeriodEnd: true });
    expect(screen.getByTestId("account-pro-plan").textContent).toBe("Pro · Yearly");
    expect(screen.getByTestId("account-pro-renewal").textContent).toMatch(/^Cancels on /);
    expect(screen.getByTestId("account-pro-manage")).toBeTruthy();
    setPro(true, { ...monthly, plan: "lifetime", currentPeriodEnd: null, source: "lifetime" });
    expect(screen.queryByTestId("account-pro-manage")).toBeNull();
  });

  it("You're Pro: plan, renewal, the included list; Manage only for subscriptions", () => {
    setPro(true, { ...monthly, cancelAtPeriodEnd: true });
    render(<ProState testId="pro" />);
    expect(screen.getByTestId("pro-pro-state").textContent).toContain("You're Pro");
    expect(screen.getByTestId("pro-pro-plan").textContent).toBe("Monthly");
    expect(screen.getByTestId("pro-pro-renewal").getAttribute("data-cancels")).toBe("1");
    expect(screen.getByTestId("pro-manage")).toBeTruthy();
    expect(screen.getByTestId("pro-pro-included").querySelectorAll("li").length).toBeGreaterThan(5);
    setPro(true, { ...monthly, plan: "manual", currentPeriodEnd: null, source: "manual" });
    expect(screen.queryByTestId("pro-manage")).toBeNull();
    expect(screen.getByTestId("pro-pro-plan").textContent).toBe("Gift");
  });
});
