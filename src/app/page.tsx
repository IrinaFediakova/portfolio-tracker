import { redirect } from "next/navigation";

/** The proxy sends signed-out visitors to /login; everyone else lands here. */
export default function HomePage() {
  redirect("/dashboard");
}
