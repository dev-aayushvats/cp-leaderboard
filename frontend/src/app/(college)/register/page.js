"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Mail, GraduationCap, Building2, ArrowRight, Loader2, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import useAuthStore from "@/store/useAuthStore";
import { sendOTP, registerWithOTP } from "@/utils/api";
import useCollege from "@/utils/useCollege";
import CollegeLogo from "@/components/CollegeLogo";
import { styleFor, DEFAULT_PLATFORMS } from "@/utils/platforms";

export default function Register() {
    const router = useRouter();
    const login = useAuthStore((state) => state.login);
    const college = useCollege();
    const domains = college?.email_domains ?? [];
    const platformList = college?.platforms ?? DEFAULT_PLATFORMS;
    const departments = college?.departments ?? [];
    
    const [step, setStep] = useState(1); // 1 = Details, 2 = OTP
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        batch: "",
        department: "",
        handles: {}, // { [platformId]: handle }
        otp: ""
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };
    const setHandle = (id, value) => {
        setFormData({ ...formData, handles: { ...formData.handles, [id]: value } });
    };

    // STEP 1: Send OTP
    const handleSendOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
        await sendOTP(formData.email);
        setStep(2); // Move to OTP step
        } catch (err) {
        console.error(err);
        alert(err.response?.data?.error || "Failed to send OTP");
        } finally {
        setLoading(false);
        }
    };

    // STEP 2: Verify & Register
    const handleFinalRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
        const res = await registerWithOTP({
            ...formData,
            batch: formData.batch === "" ? null : Number(formData.batch),
            department: formData.department || null,
        });
        login(res.data.token, res.data.user);
        router.push("/");
        } catch (err) {
        console.error(err);
        alert(err.response?.data?.error || "Invalid OTP");
        } finally {
        setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-dark-bg flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-brand/5 rounded-full blur-[128px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-brand-2/5 rounded-full blur-[128px] pointer-events-none" />

            <motion.div
        layout
        className="w-full max-w-md bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10"
      >
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4"><CollegeLogo college={college} size={44} /></div>
          <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-2 mb-2">
            {step === 1 ? "Initialize Profile" : "Verify Identity"}
          </h1>
          <p className="text-gray-500 text-xs uppercase tracking-widest">
            {step === 1 ? `Join the ${college?.name ?? ""} Leaderboard`.replace("  ", " ") : `Sent code to ${formData.email}`}
          </p>
        </div>

        <form onSubmit={step === 1 ? handleSendOtp : handleFinalRegister} className="space-y-5">
          
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {/* User Inputs */}
                <div className="relative group">
                  <User className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-brand transition-colors" />
                  <input type="text" name="username" placeholder="Display Name" required onChange={handleChange} className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-brand/50 outline-none transition-all text-sm" />
                </div>
                <div className="relative group">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-brand-2 transition-colors" />
                  <input type="email" name="email" placeholder={domains.length ? `Email (${domains.map((d) => "@" + d).join(" / ")})` : "Email Address"} required onChange={handleChange} className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-brand-2/50 outline-none transition-all text-sm" />
                </div>
                
                {/* College info (optional) */}
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[10px] text-gray-500 uppercase mb-3">College info (optional)</p>
                  <div className={`grid gap-3 ${departments.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                    <div className="relative group">
                      <GraduationCap className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-brand-2 transition-colors" />
                      <input type="number" name="batch" min="1990" max="2100" placeholder="Batch (e.g. 2027)" aria-label="Batch (graduation year)" onChange={handleChange} className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-brand-2/50 outline-none transition-all text-sm" />
                    </div>
                    {departments.length > 0 && (
                      <div className="relative group">
                        <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-brand transition-colors" />
                        <select name="department" aria-label="Department" defaultValue="" onChange={handleChange} className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-brand/50 outline-none transition-all text-sm">
                          <option value="">Department</option>
                          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Platform Handles */}
                <div className="pt-2 border-t border-white/5">
                   <p className="text-[10px] text-gray-500 uppercase mb-3">Link Accounts</p>
                   <div className="space-y-3">
                     {platformList.map(({ id, label }) => {
                       const { Icon } = styleFor(id);
                       return (
                         <div key={id} className="relative group">
                           <Icon className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                           <input
                             type="text"
                             aria-label={`${label} username`}
                             placeholder={`${label} username`}
                             value={formData.handles[id] || ""}
                             onChange={(e) => setHandle(id, e.target.value)}
                             className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-white/30 outline-none transition-all text-sm"
                           />
                         </div>
                       );
                     })}
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                {/* OTP Input */}
                <div className="relative group">
                   <KeyRound className="absolute left-3 top-3 w-5 h-5 text-gray-500 group-focus-within:text-brand transition-colors" />
                   <input 
                      type="text" 
                      name="otp" 
                      placeholder="Enter 6-digit Code" 
                      required 
                      maxLength="6"
                      className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-brand/50 outline-none transition-all text-lg tracking-widest font-bold text-center"
                      onChange={handleChange}
                   />
                </div>
                <p className="text-center text-xs text-gray-500">
                  Didn't receive code? <button type="button" onClick={() => setStep(1)} className="text-brand hover:underline">Try again</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dynamic Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full font-bold py-3 rounded-lg transition-all duration-300 transform hover:scale-[1.02] flex items-center justify-center gap-2 mt-6 ${
                step === 1 
                ? "bg-white text-black hover:bg-brand" 
                : "bg-brand text-black hover:opacity-90"
            }`}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {step === 1 ? "Send Verification Code" : "Verify & Create Account"} 
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </motion.div>
        </main>
    );
}