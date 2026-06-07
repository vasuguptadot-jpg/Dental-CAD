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
import { Label } from "@/components/ui/label";
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
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-zinc-950 to-zinc-950"></div>
      
      <div className="z-10 w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Activity className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">OrthoVision</h1>
          <p className="text-zinc-400">Clinical precision planning platform</p>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl shadow-2xl">
          <CardHeader>
            <CardTitle className="text-white">Doctor Login</CardTitle>
            <CardDescription className="text-zinc-400">Enter your credentials to access your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300">Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input 
                            placeholder="doctor@clinic.com" 
                            className="pl-10 bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-primary" 
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-300">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                          <Input 
                            type="password" 
                            placeholder="••••••••" 
                            className="pl-10 bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-primary" 
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium"
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
        
        <p className="text-center text-xs text-zinc-500">
          Secure, HIPAA-compliant environment
        </p>
      </div>
    </div>
  );
}
