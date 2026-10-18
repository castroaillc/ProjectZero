import { AuthScreen, TodosScreen } from "@projectzero/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authClient, clearToken } from "./auth";

export function App() {
  const queryClient = useQueryClient();
  const { data: session, isPending, refetch } = authClient.useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  if (isPending) return null;

  if (session) {
    return (
      <TodosScreen
        userName={session.user.name}
        onSignOut={async () => {
          await authClient.signOut();
          await clearToken();
          queryClient.clear();
          await refetch();
        }}
      />
    );
  }

  const signUp = mode === "sign-up";
  return (
    <AuthScreen
      key={mode}
      mode={mode}
      onSubmit={async ({ name, email, password }) => {
        const { error } = signUp
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });
        if (error) return error.message ?? "Something went wrong.";
        await refetch();
      }}
      footer={
        <>
          {signUp ? "Already have an account? " : "No account? "}
          <button
            type="button"
            onClick={() => setMode(signUp ? "sign-in" : "sign-up")}
            className="font-medium text-accent hover:underline"
          >
            {signUp ? "Sign in" : "Create one"}
          </button>
        </>
      }
    />
  );
}
