import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Activity, Lock, Mail, Loader2 } from "lucide-react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const loginMutation = useLogin();
  const { toast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          setUser(res.doctor);
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Login failed",
            description: (err as any)?.error || "Invalid credentials. Please try again.",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FAFAFA] p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="h-14 w-14 rounded-2xl bg-foreground flex items-center justify-center shadow-sm">
            <Activity className="h-7 w-7 text-background" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">OrthoVision</h1>
          <p className="text-muted-foreground text-sm">Clinical precision planning platform</p>
        </div>

        <Card className="border border-border shadow-md bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-foreground text-lg font-semibold">Doctor Login</CardTitle>
            <CardDescription className="text-muted-foreground">Enter your credentials to access your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground text-sm font-medium">Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="doctor@clinic.com"
                            className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-foreground/20"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground text-sm font-medium">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-foreground/20"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full font-medium mt-2"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Access Workspace
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Secure, HIPAA-compliant environment
        </p>
      </div>
    </div>
  );
}
