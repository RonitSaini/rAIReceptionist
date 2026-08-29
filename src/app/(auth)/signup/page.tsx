import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <p className="text-3xl font-black tracking-tight text-brand-700">CallCover</p>
        <p className="mt-1 text-gray-500">Step 1 of 8 · Create your account</p>
      </div>
      <SignupForm googleEnabled={googleEnabled} />
      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
