const express = require('express');
const cors = require('cors');
const pool = require('./config/db'); // Import DB connection
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // Built-in Node module

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Allows us to parse JSON bodies

// --- MIDDLEWARE: Protect Routes ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET || "your_super_secret_key_change_this", (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail', // or your SMTP provider
    auth: {
        user: process.env.EMAIL_USER, // Your email address
        pass: process.env.EMAIL_PASS  // Your App Password (not login password)
    }
});

// --- ROUTES ---

// 1. Test Route
app.get('/', (req, res) => {
    res.send('Leaderboard API is running');
});

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key_change_this";

// --- ROUTES ---

// SEND OTP
app.post('/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Check if user already exists (Prevent duplicate registration)
        const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: "User already exists. Please login." });
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();

        // Save to DB (Upsert: Update if exists, Insert if new)
        await pool.query(
            `INSERT INTO email_otps (email, otp_code) VALUES ($1, $2)
             ON CONFLICT (email) DO UPDATE SET otp_code = $2, created_at = NOW(), expires_at = (NOW() + INTERVAL '5 minutes')`,
            [email, otp]
        );

        // Send Email
        await transporter.sendMail({
            from: '"Competitive Leaderboard" <your-email@gmail.com>',
            to: email,
            subject: 'Your Verification Code',
            text: `Your verification code is: ${otp}. It expires in 5 minutes.`
        });

        res.json({ message: "OTP sent successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send email" });
    }
});

// 2. VERIFY & REGISTER WITH OTP
app.post('/register-with-otp', async (req, res) => {
    try {
        const { username, email, otp, leetcodeHandle, codeforcesHandle } = req.body;

        // A. Verify OTP
        const otpCheck = await pool.query(
            "SELECT * FROM email_otps WHERE email = $1 AND otp_code = $2 AND expires_at > NOW()",
            [email, otp]
        );

        if (otpCheck.rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        // B. Create User (No Password!)
        const newUser = await pool.query(
            "INSERT INTO users (username, email) VALUES ($1, $2) RETURNING user_id, username, email",
            [username, email]
        );
        const userId = newUser.rows[0].user_id;

        // C. Insert Handles
        if (leetcodeHandle) await pool.query("INSERT INTO platform_stats (user_id, platform_name, platform_handle) VALUES ($1, 'leetcode', $2)", [userId, leetcodeHandle]);
        if (codeforcesHandle) await pool.query("INSERT INTO platform_stats (user_id, platform_name, platform_handle) VALUES ($1, 'codeforces', $2)", [userId, codeforcesHandle]);

        // D. Clean up OTP
        await pool.query("DELETE FROM email_otps WHERE email = $1", [email]);

        // E. Generate Token (Auto Login)
        const token = jwt.sign({ user_id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ message: "Registered!", token, user: newUser.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// SEND LOGIN OTP
app.post('/send-login-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Check if user exists (Must exist for login)
        const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "No account found with this email. Please register." });
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();

        // Save to DB
        await pool.query(
            `INSERT INTO email_otps (email, otp_code) VALUES ($1, $2)
             ON CONFLICT (email) DO UPDATE SET otp_code = $2, created_at = NOW(), expires_at = (NOW() + INTERVAL '5 minutes')`,
            [email, otp]
        );

        // Send Email
        await transporter.sendMail({
            from: '"Competitive Leaderboard" <your-email@gmail.com>',
            to: email,
            subject: 'Login Verification Code',
            text: `Your login code is: ${otp}. Do not share this code.`
        });

        res.json({ message: "OTP sent successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send email" });
    }
});

// VERIFY LOGIN OTP
app.post('/login-with-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        // A. Verify OTP
        const otpCheck = await pool.query(
            "SELECT * FROM email_otps WHERE email = $1 AND otp_code = $2 AND expires_at > NOW()",
            [email, otp]
        );

        if (otpCheck.rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        // B. Get User Details
        const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = userResult.rows[0];

        // C. Clean up OTP
        await pool.query("DELETE FROM email_otps WHERE email = $1", [email]);

        // D. Generate Token
        const token = jwt.sign({ user_id: user.user_id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ 
            message: "Login successful", 
            token, 
            user: { username: user.username, email: user.email, institute: user.institute, country: user.country, state: user.state } 
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// GET USER PROFILE (with handles)
app.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        // Complex query to flatten the handles into a single object
        const user = await pool.query(
            `SELECT u.username, u.email, u.institute, u.country, u.state,
            MAX(CASE WHEN p.platform_name = 'leetcode' THEN p.platform_handle END) as leetcode_handle,
            MAX(CASE WHEN p.platform_name = 'codeforces' THEN p.platform_handle END) as codeforces_handle
            FROM users u
            LEFT JOIN platform_stats p ON u.user_id = p.user_id
            WHERE u.user_id = $1
            GROUP BY u.user_id`,
            [userId]
        );

        if (user.rows.length === 0) return res.sendStatus(404);
        res.json(user.rows[0]);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Update Profile Route
app.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { institute, country, state, leetcodeHandle, codeforcesHandle } = req.body;
        const userId = req.user.user_id;

        // A. Update Basic Info
        await pool.query(
            "UPDATE users SET institute = $1, country = $2, state = $3 WHERE user_id = $4",
            [institute, country, state, userId]
        );

        // B. Update/Insert LeetCode Handle
        if (leetcodeHandle) {
            await pool.query(
                `INSERT INTO platform_stats (user_id, platform_name, platform_handle, rating, questions_solved)
                 VALUES ($1, 'leetcode', $2, 0, 0)
                 ON CONFLICT (user_id, platform_name) 
                 DO UPDATE SET platform_handle = $2, rating = 0, questions_solved = 0, last_updated = NOW()`,
                [userId, leetcodeHandle]
            );
        }

        // C. Update/Insert Codeforces Handle
        if (codeforcesHandle) {
            await pool.query(
                `INSERT INTO platform_stats (user_id, platform_name, platform_handle, rating, max_rating)
                 VALUES ($1, 'codeforces', $2, 0, 0)
                 ON CONFLICT (user_id, platform_name) 
                 DO UPDATE SET platform_handle = $2, rating = 0, max_rating = 0, last_updated = NOW()`,
                [userId, codeforcesHandle]
            );
        }

        res.json({ message: "Profile updated successfully" });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Get Leaderboard Route (with filters)
app.get('/leaderboard/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { institute, country, state } = req.query; // Read query params

        // Start building the query
        let queryText = `
            SELECT 
                u.username, u.institute, u.country, u.state,
                p.platform_handle, p.rating, p.max_rating, p.questions_solved,
                (p.questions_solved - p.daily_starting_count) as questions_today 
            FROM platform_stats p
            JOIN users u ON p.user_id = u.user_id
            WHERE p.platform_name = $1
        `;
        
        const queryParams = [platform];
        let paramCount = 1;

        // Dynamically add filters if they exist
        if (institute) {
            paramCount++;
            queryText += ` AND u.institute = $${paramCount}`;
            queryParams.push(institute);
        }
        if (country) {
            paramCount++;
            queryText += ` AND u.country = $${paramCount}`;
            queryParams.push(country);
        }
        if (state) {
            paramCount++;
            queryText += ` AND u.state = $${paramCount}`;
            queryParams.push(state);
        }

        // Add sorting
        queryText += ` ORDER BY p.rating DESC`;

        const leaderboard = await pool.query(queryText, queryParams);
        res.json(leaderboard.rows);

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});