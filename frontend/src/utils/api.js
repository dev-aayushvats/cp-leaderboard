import axios from 'axios';
import useAuthStore from '@/store/useAuthStore';

// Where the browser sends API calls. Unset (the default) means same-origin /api, which the app's
// own server proxies to the backend (see app/api/[...path]/route.js): one build then works for
// any deployment. Set NEXT_PUBLIC_API_BASE_URL (at build time) to call a separate API origin directly.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

// Which college a request is for is normally decided by the hostname the browser is
// on (mit.example.com -> MIT, or a college's own custom domain), so one build serves
// every college. NEXT_PUBLIC_COLLEGE_SLUG pins a deployment to one college regardless
// of hostname (optional: for single-college installs and local development).
export const COLLEGE_SLUG = process.env.NEXT_PUBLIC_COLLEGE_SLUG || '';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(COLLEGE_SLUG ? { 'X-College-Slug': COLLEGE_SLUG } : {}),
  },
});

// Tell the API which hostname the user is on so it can pick the college
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') config.headers['X-College-Host'] = window.location.hostname;
  return config;
});

// Request interceptor to add auth token automatically
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for common error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized - redirect to login
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ==================== COLLEGE APIs ====================

/**
 * Get public info about this deployment's college (name, logo, allowed email domains)
 * @returns {Promise} Axios response: { slug, name, logo_url, email_domains, departments, batches, platforms }
 */
export const getCollege = () => {
  return api.get('/college');
};

// ==================== AUTHENTICATION APIs ====================

/**
 * Send OTP for login
 * @param {string} email - User email address
 * @returns {Promise} Axios response
 */
export const sendLoginOTP = (email) => {
  return api.post('/send-login-otp', { email });
};

/**
 * Login with OTP
 * @param {Object} data - Login data
 * @param {string} data.email - User email
 * @param {string} data.otp - OTP code
 * @returns {Promise} Axios response with token and user data
 */
export const loginWithOTP = (data) => {
  return api.post('/login-with-otp', data);
};

/**
 * Send OTP for registration
 * @param {string} email - User email address
 * @returns {Promise} Axios response
 */
export const sendOTP = (email) => {
  return api.post('/send-otp', { email });
};

/**
 * Register with OTP
 * @param {Object} data - Registration data
 * @param {string} data.username - Username
 * @param {string} data.email - User email
 * @param {Object} data.handles - { [platformId]: handle } (all optional)
 * @param {number|string} data.batch - Graduation year (optional)
 * @param {string} data.department - One of the college's departments (optional)
 * @param {string} data.otp - OTP code
 * @returns {Promise} Axios response with token and user data
 */
export const registerWithOTP = (data) => {
  return api.post('/register-with-otp', data);
};

// ==================== PROFILE APIs ====================

/**
 * Get user profile
 * @returns {Promise} Axios response with profile data
 */
export const getProfile = () => {
  return api.get('/profile');
};

/**
 * Update user profile
 * @param {Object} data - Profile data to update
 * @param {number|null} data.batch - Graduation year; null clears it, omit to leave unchanged
 * @param {string|null} data.department - A college department; null clears it
 * @param {Object} data.handles - { [platformId]: handle }. A different handle resets that platform's stats.
 * @returns {Promise} Axios response
 */
export const updateProfile = (data) => {
  return api.put('/profile', data);
};

/**
 * Prove ownership of a linked handle. The user's verification code must be
 * present in their public platform profile.
 * @param {string} platform - 'leetcode' or 'codeforces'
 * @returns {Promise} Axios response: { verified: true } (errors carry a helpful message)
 */
export const verifyHandle = (platform) => {
  return api.post(`/profile/verify/${platform}`);
};

// ==================== ADMIN APIs (college_admin only) ====================

export const getAdminStats = () => api.get('/admin/stats');

/** @param {{search?: string, limit?: number, offset?: number}} params */
export const getAdminUsers = (params = {}) => api.get('/admin/users', { params });

/** @param {{is_active?: boolean, role?: 'student'|'college_admin'}} data */
export const updateAdminUser = (id, data) => api.patch(`/admin/users/${id}`, data);

export const deleteAdminUser = (id) => api.delete(`/admin/users/${id}`);

/**
 * Bulk-import members. With dry_run (the default) nothing is written: you get a per-row
 * verdict to preview. Send dry_run: false to actually import the rows marked ok.
 * @param {Object[]} rows - [{ line, email, name, batch, department, handles: {platformId: handle} }] (max 1000)
 * @param {{dryRun?: boolean}} options
 */
export const importMembers = (rows, { dryRun = true } = {}) => api.post('/admin/users/import', { rows, dry_run: dryRun });

export const getAdminCollege = () => api.get('/admin/college');

/** @param {{name?: string, logo_url?: string, email_domains?: string[], require_verified_handles?: boolean}} data */
export const updateAdminCollege = (data) => api.patch('/admin/college', data);

/** Upload a logo image (PNG, JPEG, GIF, WebP or SVG, up to 512 KB). @param {File} file */
export const uploadCollegeLogo = (file) =>
  api.put('/admin/college/logo', file, { headers: { 'Content-Type': file.type } });

/** Remove the uploaded logo (a pasted logo URL, if any, is used again). */
export const removeCollegeLogo = () => api.delete('/admin/college/logo');

// ==================== LEADERBOARD APIs ====================

/**
 * Get leaderboard data
 * @param {string} platform - Platform id (see getCollege().platforms)
 * @param {Object} filters - Optional filters
 * @param {string|number} filters.batch - Filter by graduation year
 * @param {string} filters.department - Filter by department
 * @returns {Promise} Axios response with leaderboard array
 */
export const getLeaderboard = (platform, filters = {}) => {
  const params = new URLSearchParams();
  if (filters.batch) params.append('batch', filters.batch);
  if (filters.department) params.append('department', filters.department);

  const queryString = params.toString();
  const url = `/leaderboard/${platform}${queryString ? `?${queryString}` : ''}`;
  
  return api.get(url);
};

/**
 * Public member profile: ratings, rank in the college and rating history per platform.
 * @param {string} username - Display name (URL-encoded for you)
 * @returns {Promise} Axios response (404 if there is no such member)
 */
export const getUserProfile = (username) => {
  return api.get(`/users/${encodeURIComponent(username)}`);
};

// Export the axios instance for custom requests if needed
export default api;

