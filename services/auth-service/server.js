const express = require("express");
const cors = require("cors");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.AUTH_PORT || 8081;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.AUTH_JWT_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists
        const userQuery = "SELECT * FROM users WHERE google_id = $1";
        const existing = await pool.query(userQuery, [profile.id]);

        if (existing.rows.length > 0) {
          return done(null, existing.rows[0]);
        }

        // Create new user
        const insertQuery = `
      INSERT INTO users (google_id, email, name, avatar_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
        const newUser = await pool.query(insertQuery, [
          profile.id,
          profile.emails[0].value,
          profile.displayName,
          profile.photos[0].value,
        ]);

        return done(null, newUser.rows[0]);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "auth-service" });
});

// Start Google OAuth
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback
app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "http://localhost:3000/login/login.html",
  }),
  async (req, res) => {
    try {
      // Create session token
      const sessionToken = jwt.sign(
        { userId: req.user.id, email: req.user.email },
        process.env.AUTH_JWT_SECRET || "dev-secret",
        { expiresIn: "24h" }
      );

      // Save session to database
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      await pool.query(
        "INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)",
        [req.user.id, sessionToken, expiresAt]
      );

      // For popup flow: return HTML that closes popup and sends token to parent
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authentication Success</title></head>
        <body>
          <script>
            // Store token in parent window
            if (window.opener) {
              window.opener.localStorage.setItem('auth_token', '${sessionToken}');
              window.opener.postMessage({ type: 'AUTH_SUCCESS', token: '${sessionToken}' }, 'http://localhost:3000');
            }
            // Close popup
            window.close();
          </script>
          <p>Authentication successful. This window will close automatically.</p>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Session creation error:", error);
      res.redirect(
        "http://localhost:3000/login/login.html?error=session_failed"
      );
    }
  }
);

// Verify token endpoint
app.get("/auth/verify", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.AUTH_JWT_SECRET || "dev-secret"
    );

    // Check if session exists in database
    const sessionQuery =
      "SELECT * FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()";
    const session = await pool.query(sessionQuery, [token]);

    if (session.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    // Get user info
    const userQuery =
      "SELECT id, email, name, avatar_url FROM users WHERE id = $1";
    const user = await pool.query(userQuery, [decoded.userId]);

    res.json({ user: user.rows[0] });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// Logout
app.post("/auth/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (token) {
    try {
      await pool.query("DELETE FROM user_sessions WHERE session_token = $1", [
        token,
      ]);
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
