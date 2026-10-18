import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Field } from "../components/field";
import { Input } from "../components/input";

export interface AuthValues {
  name: string;
  email: string;
  password: string;
}

export interface AuthScreenProps {
  mode: "sign-in" | "sign-up";
  /** Performs the sign-in/up. Resolve with an error message to show it, or nothing on success. */
  onSubmit: (values: AuthValues) => Promise<string | null | undefined | void>;
  /** Link or button for switching between sign-in and sign-up. */
  footer?: ReactNode;
}

/** Email + password form shared by the web app and the desktop renderer. */
export function AuthScreen({ mode, onSubmit, footer }: AuthScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signUp = mode === "sign-up";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const message = await onSubmit({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      if (message) setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">{signUp ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-muted">
          {signUp ? "Start tracking your todos." : "Sign in to see your todos."}
        </p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {signUp && (
            <Field label="Name">
              <Input name="name" autoComplete="name" required />
            </Field>
          )}
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete={signUp ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait…" : signUp ? "Create account" : "Sign in"}
          </Button>
        </form>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </Card>
    </main>
  );
}
