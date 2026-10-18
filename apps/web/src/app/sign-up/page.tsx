"use client";

import { AuthScreen } from "@projectzero/ui-web";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  return (
    <AuthScreen
      mode="sign-up"
      onSubmit={async ({ name, email, password }) => {
        const { error } = await authClient.signUp.email({ name, email, password });
        if (error) return error.message ?? "Could not create the account.";
        // Full navigation so the session store starts from the new cookie; a client-side
        // transition can render "/" with the stale signed-out session and bounce back here.
        window.location.assign("/");
      }}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    />
  );
}
