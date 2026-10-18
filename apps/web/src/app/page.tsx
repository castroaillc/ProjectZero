"use client";

import { TodosScreen } from "@projectzero/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NavLink } from "@/components/nav-link";
import { authClient } from "@/lib/auth-client";

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending, isRefetching } = authClient.useSession();
  const signedOut = !isPending && !isRefetching && !session;

  useEffect(() => {
    if (signedOut) router.replace("/sign-in");
  }, [signedOut, router]);

  if (!session) return null;

  return (
    <TodosScreen
      userName={session.user.name}
      nav={
        <NavLink href="/agents">
          <Bot className="size-4" aria-hidden /> Agents
        </NavLink>
      }
      onSignOut={async () => {
        await authClient.signOut();
        queryClient.clear();
        router.replace("/sign-in");
      }}
    />
  );
}
