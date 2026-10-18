"use client";

import { AuthScreen } from "@projectzero/ui-web";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  return (
    <AuthScreen
      mode="sign-in"
      onSubmit={async ({ email, password }) => {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) return error.message ?? "Could not sign in.";
        // Full navigation so the session store starts from the new cookie; a client-side
        // transition can render "/" with the stale signed-out session and bounce back here.
        window.location.assign("/");
      }}
      footer={
        <>
          No account?{" "}
          <Link href="/sign-up" className="font-medium text-accent hover:underline">
            Create one
          </Link>
        </>
      }
    />
  );
}
