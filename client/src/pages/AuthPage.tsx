/**
 * Authentication Page
 * 
 * Production-grade authentication UI with sign-in and sign-up tabs.
 * Supports email/password and Google OAuth authentication.
 * 
 * @module pages/auth
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, Mail, User, Lock, Loader2 } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../context/AuthProvider';

// ============================================================================
// Form Schemas
// ============================================================================

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const signUpSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

type SignInForm = z.infer<typeof signInSchema>;
type SignUpForm = z.infer<typeof signUpSchema>;

// ============================================================================
// Component
// ============================================================================

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { signIn, signUp, signInWithGoogle, isLoading } = useAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Sign In Form
  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  // Sign Up Form
  const signUpForm = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  });

  // Handle Sign In
  const handleSignIn = async (data: SignInForm) => {
    try {
      await signIn(data.email, data.password);
      toast({
        title: 'Welcome back! 🛹',
        description: 'You have successfully signed in.',
      });
      setLocation('/map');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      toast({
        title: 'Sign In Failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  // Handle Sign Up
  const handleSignUp = async (data: SignUpForm) => {
    try {
      await signUp(data.email, data.password, {
        firstName: data.firstName,
        lastName: data.lastName,
      });
      toast({
        title: 'Account Created! 📧',
        description: 'Please check your email to verify your account.',
      });
      setLocation('/verify');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      toast({
        title: 'Registration Failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast({
        title: 'Welcome! 🛹',
        description: 'You have successfully signed in with Google.',
      });
      setLocation('/map');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign in failed';
      toast({
        title: 'Google Sign In Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isFormLoading = isLoading || signInForm.formState.isSubmitting || signUpForm.formState.isSubmitting;

  return (
    <div className="min-h-screen bg-[#181818] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <span className="text-4xl mr-2">🛹</span>
            <h1 className="text-3xl font-bold text-white">SkateHubba</h1>
          </div>
          <p className="text-gray-400">Find and share the best skate spots</p>
        </div>

        {/* Auth Card */}
        <Card className="bg-[#232323] border-gray-700">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'signin' | 'signup')}>
            <TabsList className="grid w-full grid-cols-2 bg-[#181818]">
              <TabsTrigger 
                value="signin" 
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger 
                value="signup"
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="signin">
              <CardHeader>
                <CardTitle className="text-xl text-white">Welcome Back</CardTitle>
                <CardDescription className="text-gray-400">
                  Sign in to your account to continue
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="text-gray-300">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        {...signInForm.register('email')}
                        className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      />
                    </div>
                    {signInForm.formState.errors.email && (
                      <p className="text-sm text-red-400">{signInForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-gray-300">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        {...signInForm.register('password')}
                        className="pl-10 pr-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-gray-400 hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {signInForm.formState.errors.password && (
                      <p className="text-sm text-red-400">{signInForm.formState.errors.password.message}</p>
                    )}
                  </div>

                  {/* Submit */}
                  <Button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={isFormLoading}
                  >
                    {isFormLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#232323] px-2 text-gray-400">Or continue with</span>
                  </div>
                </div>

                {/* Google Sign In */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-gray-600 text-white hover:bg-gray-700"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <SiGoogle className="mr-2 h-4 w-4" />
                  )}
                  Continue with Google
                </Button>
              </CardContent>
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="signup">
              <CardHeader>
                <CardTitle className="text-xl text-white">Create Account</CardTitle>
                <CardDescription className="text-gray-400">
                  Join the community and start sharing spots
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                  {/* Name Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-gray-300">First Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="firstName"
                          placeholder="John"
                          {...signUpForm.register('firstName')}
                          className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                        />
                      </div>
                      {signUpForm.formState.errors.firstName && (
                        <p className="text-sm text-red-400">{signUpForm.formState.errors.firstName.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-gray-300">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        {...signUpForm.register('lastName')}
                        className="bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      />
                      {signUpForm.formState.errors.lastName && (
                        <p className="text-sm text-red-400">{signUpForm.formState.errors.lastName.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-gray-300">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        {...signUpForm.register('email')}
                        className="pl-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      />
                    </div>
                    {signUpForm.formState.errors.email && (
                      <p className="text-sm text-red-400">{signUpForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-gray-300">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        {...signUpForm.register('password')}
                        className="pl-10 pr-10 bg-[#181818] border-gray-600 text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-gray-400 hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Must contain at least 8 characters with uppercase, lowercase, and numbers
                    </p>
                    {signUpForm.formState.errors.password && (
                      <p className="text-sm text-red-400">{signUpForm.formState.errors.password.message}</p>
                    )}
                  </div>

                  {/* Submit */}
                  <Button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={isFormLoading}
                  >
                    {isFormLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>

                  {/* Terms */}
                  <p className="text-xs text-center text-gray-500">
                    By creating an account, you agree to our{' '}
                    <Link href="/terms" className="text-orange-500 hover:underline">Terms of Service</Link>
                    {' '}and{' '}
                    <Link href="/privacy" className="text-orange-500 hover:underline">Privacy Policy</Link>
                  </p>
                </form>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#232323] px-2 text-gray-400">Or continue with</span>
                  </div>
                </div>

                {/* Google Sign Up */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-gray-600 text-white hover:bg-gray-700"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <SiGoogle className="mr-2 h-4 w-4" />
                  )}
                  Continue with Google
                </Button>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
