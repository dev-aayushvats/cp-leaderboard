"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowRight, Loader2, KeyRound } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import useAuthStore from "@/store/useAuthStore";

export default function Login() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const [step, setStep] = useState(1); // 1 = Email, 2 = OTP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    email: "",
    otp: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  // STEP 1: Send OTP
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await axios.post("http://localhost:5000/send-login-otp", { email: formData.email });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send code.");
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify & Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await axios.post("http://localhost:5000/login-with-otp", formData);
      login(res.data.token, res.data.user);
      router.push("/");
    } catch (err) {
      setError(err.response?.data?.error || "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center p-4 relative overflow-hidden font-mono">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-pastel-green/5 rounded-full blur-[128px] pointer-events-none" />
      
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10"
      >
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
            {step === 1 ? "Welcome Back" : "Verify Login"}
          </h1>
          <p className="text-gray-500 text-xs font-mono">
             {step === 1 ? "Enter your email to access the terminal" : `Code sent to ${formData.email}`}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={step === 1 ? handleSendOtp : handleLogin}>
          
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="relative group"
              >
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-pastel-green transition-colors" />
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-pastel-green/50 focus:ring-1 focus:ring-pastel-green/50 transition-all font-mono text-sm"
                />
              </motion.div>
            ) : (
              <motion.div
                 key="step2"
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: 20 }}
                 className="space-y-4"
              >
                 <div className="relative group">
                    <KeyRound className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-pastel-green transition-colors" />
                    <input 
                       type="text" 
                       name="otp" 
                       placeholder="Enter 6-digit Code" 
                       required 
                       maxLength="6"
                       className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-pastel-green/50 outline-none transition-all text-lg tracking-widest font-bold text-center"
                       onChange={handleChange}
                    />
                 </div>
                 <p className="text-center text-xs text-gray-500">
                   Wrong email? <button type="button" onClick={() => setStep(1)} className="text-pastel-green hover:underline">Go back</button>
                 </p>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-pastel-green to-emerald-400 text-black font-bold py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform hover:scale-[1.02] flex items-center justify-center gap-2 shadow-lg shadow-pastel-green/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {step === 1 ? "Send Verification Code" : "Access Terminal"} 
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-gray-500 font-mono">
          Don't have an account?{" "}
          <Link href="/register" className="text-pastel-green hover:underline">
            Register
          </Link>
        </p>
      </motion.div>
    </main>
  );
}