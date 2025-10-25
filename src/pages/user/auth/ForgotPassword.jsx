import { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../../firebase";

import Button from "../../../components/ui/Button";
import { Field, Input, Label } from "@headlessui/react";
import clsx from "clsx";

import { GradientBackground } from "../../../components/ui/Gradient";

import { useToast } from "../../../components/Toast/ToastProvider"; // 👈 Import useToast

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const { showToast } = useToast(); // 👈 Use the toast hook

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showToast("Password reset email sent.", "success"); // ✅ Success toast
    } catch (e) {
      showToast("Error: " + e.message, "error"); // ✅ Error toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="overflow-hidden bg-gray-50">
      <GradientBackground />
      <div className="isolate flex min-h-dvh items-center justify-center p-6 lg:p-8">
        <div className="w-full max-w-md rounded-xl bg-white shadow-md ring-1 ring-black/5">
          <form onSubmit={onSubmit} className="p-7 sm:p-11">
            <h1 className="text-base/6 font-medium">Forgot your password?</h1>
            <p className="mt-1 text-sm/5 text-gray-600">
              Enter your email and we’ll send you a reset link.
            </p>

            <Field className="mt-8 space-y-3">
              <Label className="text-sm/5 font-medium">Email</Label>
              <Input
                required
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={clsx(
                  "block w-full rounded-lg border border-transparent shadow-sm ring-1 ring-black/10",
                  "px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-base/6 sm:text-sm/6",
                  "data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
                )}
              />
            </Field>

            <div className="mt-8">
              <Button
                type="submit"
                className="w-full"
                loading={loading}
                loadingText="Sending reset email…"
              >
                Send reset email
              </Button>
            </div>

            <div className="mt-6 text-sm/5">
              <Link to="/login" className="font-medium hover:text-gray-600">
                Back to sign in
              </Link>
            </div>
          </form>

          <div className="m-1.5 rounded-lg bg-gray-50 py-4 text-center text-sm/5 ring-1 ring-black/5">
            Don’t have an account?{" "}
            <Link to="/signup" className="font-medium hover:text-gray-600">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
