"use client";

import { CodingAgentsScreen } from "@projectzero/ui-web";
import { ListTodo } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NavLink } from "@/components/nav-link";
import { authClient } from "@/lib/auth-client";

export default function AgentsPage() {
  const router = useRouter();
  const { data: session, isPending, isRefetching } = authClient.useSession();
  const signedOut = !isPending && !isRefetching && !session;

  useEffect(() => {
    if (signedOut) router.replace("/sign-in");
  }, [signedOut, router]);

  if (!session) return null;

  return (
    <CodingAgentsScreen
      nav={
        <NavLink href="/">
          <ListTodo className="size-4" aria-hidden /> Todos
        </NavLink>
      }
    />
  );
}
