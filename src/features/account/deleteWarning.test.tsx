// @req AUTH-005 @req PAY-003
/** B-3: the delete-account panel tells a Pro user that deletion cancels the subscription. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEntitlements } from "@/lib/entitlements/store";
import { SubscriptionWarning } from "./AccountScreen";

const portal = vi.fn(async () => ({ status: "unavailable" as const }));
vi.mock("@/lib/entitlements/checkout", () => ({ openPortal: () => portal() }));

afterEach(() => {
  cleanup();
  useEntitlements.setState({ pro: false });
  portal.mockClear();
});

describe("delete account: subscription warning (B-3)", () => {
  it("is hidden for free users", () => {
    useEntitlements.setState({ pro: false });
    render(<SubscriptionWarning />);
    expect(screen.queryByTestId("account-delete-subscription")).toBeNull();
  });

  it("warns Pro users and links to Manage subscription", async () => {
    useEntitlements.setState({ pro: true });
    render(<SubscriptionWarning />);
    expect(screen.getByTestId("account-delete-subscription").textContent).toContain(
      "Deleting your account cancels your subscription right away",
    );
    fireEvent.click(screen.getByTestId("account-delete-manage"));
    await vi.waitFor(() => expect(portal).toHaveBeenCalledTimes(1));
  });
});
