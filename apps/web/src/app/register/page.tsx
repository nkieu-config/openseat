"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await register({ email, password, displayName });
      router.push("/organizer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
      setBusy(false);
    }
  }

  async function onGoogle(credential: string) {
    setBusy(true);
    try {
      await loginWithGoogle(credential);
      router.push("/organizer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h1">Create an account</CardTitle>
          <CardDescription>Run events or keep all your tickets in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                required
                maxLength={80}
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating account…" : "Create account"}
            </Button>
            <GoogleSignInButton onCredential={onGoogle} disabled={busy} />
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                Log in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
