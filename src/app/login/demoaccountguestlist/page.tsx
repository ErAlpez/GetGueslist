import { redirect } from "next/navigation";

export default function LegacyDemoAccountLoginPage(): never {
  redirect("/login/demo");
}
