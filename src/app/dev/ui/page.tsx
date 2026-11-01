import { notFound } from "next/navigation";
import { DevUi } from "./DevUi";

export default function DevUiPage() {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" && process.env.NODE_ENV === "production")
    notFound();
  return <DevUi />;
}
