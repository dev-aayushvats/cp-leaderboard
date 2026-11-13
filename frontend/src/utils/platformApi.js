import axios from "axios";
import usePlatformStore from "@/store/usePlatformStore";

// API client for the platform console. Deliberately sends no college headers: the
// console isn't about any one college. 401 = the operator token is missing, expired
// or no longer on the allowlist, so the session is dropped and sign-in shows again.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api"; // same-origin proxy by default (see utils/api.js)

const platformApi = axios.create({ baseURL: API_BASE_URL, headers: { "Content-Type": "application/json" } });

platformApi.interceptors.request.use((config) => {
  const token = usePlatformStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && usePlatformStore.getState().token) usePlatformStore.getState().signOut();
    return Promise.reject(error);
  }
);

export const platformSendOtp = (email) => platformApi.post("/platform/send-otp", { email });
export const platformLogin = (email, otp) => platformApi.post("/platform/login", { email, otp });
export const getPlatformConfig = () => platformApi.get("/platform/config");
export const listColleges = () => platformApi.get("/platform/colleges");
/** @param {{slug, name, email_domains?, custom_domain?, admin_email?, admin_name?}} data */
export const createCollege = (data) => platformApi.post("/platform/colleges", data);
/** @param {{name?, email_domains?, custom_domain?, is_active?}} data */
export const updateCollege = (slug, data) => platformApi.patch(`/platform/colleges/${slug}`, data);
export const addCollegeAdmin = (slug, data) => platformApi.post(`/platform/colleges/${slug}/admins`, data);

export default platformApi;
