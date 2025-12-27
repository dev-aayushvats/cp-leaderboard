import axios from 'axios';
import useAuthStore from '@/store/useAuthStore';

// Get base URL from environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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
 * @param {string} data.leetcodeHandle - LeetCode handle (optional)
 * @param {string} data.codeforcesHandle - Codeforces handle (optional)
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
 * @param {string} data.institute - Institute name (optional)
 * @param {string} data.country - Country (optional)
 * @param {string} data.state - State (optional)
 * @param {string} data.leetcodeHandle - LeetCode handle (optional)
 * @param {string} data.codeforcesHandle - Codeforces handle (optional)
 * @returns {Promise} Axios response
 */
export const updateProfile = (data) => {
  return api.put('/profile', data);
};

// ==================== LEADERBOARD APIs ====================

/**
 * Get leaderboard data
 * @param {string} platform - Platform name ('leetcode' or 'codeforces')
 * @param {Object} filters - Optional filters
 * @param {string} filters.institute - Filter by institute
 * @param {string} filters.country - Filter by country
 * @param {string} filters.state - Filter by state
 * @returns {Promise} Axios response with leaderboard array
 */
export const getLeaderboard = (platform, filters = {}) => {
  const params = new URLSearchParams();
  if (filters.institute) params.append('institute', filters.institute);
  if (filters.country) params.append('country', filters.country);
  if (filters.state) params.append('state', filters.state);

  const queryString = params.toString();
  const url = `/leaderboard/${platform}${queryString ? `?${queryString}` : ''}`;
  
  return api.get(url);
};

// Export the axios instance for custom requests if needed
export default api;

