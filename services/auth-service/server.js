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
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
          console.log("👤 Existing user found:", existing.rows[0]);
          return done(null, existing.rows[0]);
        }

        // Create new user
        console.log("👤 Creating new user:", {
          googleId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
        });
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

        console.log("✅ User created successfully:", newUser.rows[0]);
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
  (req, res, next) => {
    console.log("🚀 /auth/google route called with query:", req.query);
    console.log("🔗 Full URL:", req.originalUrl);
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback
app.get(
  "/auth/google/callback",
  (req, res, next) => {
    console.log("📞 /auth/google/callback called with query:", req.query);
    console.log("🔗 Full callback URL:", req.originalUrl);
    next();
  },
  passport.authenticate("google", {
    failureRedirect: "http://localhost:3000/login/login.html",
    failureFlash: true,
  }),
  async (req, res) => {
    try {
      console.log("🔐 Starting session creation for user:", req.user);

      // Create session token
      const sessionToken = jwt.sign(
        { userId: req.user.id, email: req.user.email },
        process.env.AUTH_JWT_SECRET || "dev-secret",
        { expiresIn: "24h" }
      );

      console.log("✅ JWT token created successfully");

      // Save session to database
      console.log("💾 Saving session to database...");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      await pool.query(
        "INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)",
        [req.user.id, sessionToken, expiresAt]
      );

      console.log("✅ Session saved to database successfully");

      // For popup flow: return HTML that closes popup and sends token to parent
      console.log("📤 Sending HTML response with postMessage...");
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authentication Success</title></head>
        <body>
          <script>
            console.log('Auth callback executed');
            console.log('window.opener:', window.opener);
            console.log('token:', '${sessionToken}');
            
            // Send token to parent via postMessage only (no direct localStorage access due to CORS)
            if (window.opener) {
              console.log('Sending postMessage to parent (localStorage will be set by parent)');
              
              // Try multiple approaches to ensure message delivery
              try {
                // Method 1: Specific origin
                window.opener.postMessage({ 
                  type: 'AUTH_SUCCESS', 
                  token: '${sessionToken}' 
                }, 'http://localhost:3000');
                console.log('✅ PostMessage sent to localhost:3000');
                
                // Method 2: Wildcard origin as fallback
                window.opener.postMessage({ 
                  type: 'AUTH_SUCCESS', 
                  token: '${sessionToken}' 
                }, '*');
                console.log('✅ PostMessage sent with wildcard origin');
                
              } catch (error) {
                console.error('❌ PostMessage failed:', error);
              }
              
              console.log('PostMessage sent, closing popup');
            } else {
              console.log('No window.opener found');
            }
            
            // Close popup after small delay
            setTimeout(() => {
              console.log('Closing popup');
              window.close();
            }, 1000);
          </script>
          <p>Authentication successful. This window will close automatically.</p>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("❌ Session creation error:", error);
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

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.AUTH_JWT_SECRET || "dev-secret"
    );

    // Verify session in database
    const sessionResult = await pool.query(
      `SELECT u.id, u.google_id, u.email, u.name, u.avatar_url
       FROM users u 
       JOIN user_sessions s ON u.id = s.user_id 
       WHERE s.session_token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = sessionResult.rows[0];
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Get user's host relationships
app.get("/api/hosts", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get hosts that this user can control
    const hostsResult = await pool.query(
      `
      SELECT 
        u.id AS user_id,
        u.google_id,
        u.name AS display_name,
        u.email,
        u.avatar_url AS profile_image,
        hr.relationship_id,
        hr.status,
        hr.created_at as relationship_created,
        CASE 
          WHEN us.user_id IS NOT NULL AND us.expires_at > NOW() THEN 'online'
          ELSE 'offline'
        END as online_status
      FROM host_relationships hr
      JOIN users u ON hr.host_user_id = u.id
      LEFT JOIN user_sessions us ON u.id = us.user_id
      WHERE hr.controller_user_id = $1 AND hr.status = 'active'
      ORDER BY u.name ASC
    `,
      [userId]
    );

    res.json({
      success: true,
      hosts: hostsResult.rows,
    });
  } catch (error) {
    console.error("Get hosts error:", error);
    res.status(500).json({ error: "Failed to fetch hosts" });
  }
});

// Add new host relationship
app.post("/api/hosts", verifyToken, async (req, res) => {
  try {
    const controllerId = req.user.id;
    const { email, message } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find host user by email
    const hostResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (hostResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found with this email" });
    }

  const hostId = hostResult.rows[0].id;

    // Check if relationship already exists
    const existingResult = await pool.query(
      "SELECT * FROM host_relationships WHERE controller_user_id = $1 AND host_user_id = $2",
      [controllerId, hostId]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: "Relationship already exists" });
    }

    // Create new relationship
    const relationshipResult = await pool.query(
      `
      INSERT INTO host_relationships (controller_user_id, host_user_id, status, invitation_message)
      VALUES ($1, $2, 'pending', $3)
      RETURNING relationship_id
    `,
      [controllerId, hostId, message || null]
    );

    // TODO: Send notification to host user

    res.json({
      success: true,
      message: "Invitation sent successfully",
      relationship_id: relationshipResult.rows[0].relationship_id,
    });
  } catch (error) {
    console.error("Add host error:", error);
    res.status(500).json({ error: "Failed to add host" });
  }
});

// Remove host relationship
app.delete("/api/hosts/:relationshipId", verifyToken, async (req, res) => {
  try {
  const controllerId = req.user.id;
    const relationshipId = req.params.relationshipId;

    // Verify ownership and delete
    const result = await pool.query(
      "DELETE FROM host_relationships WHERE relationship_id = $1 AND controller_user_id = $2 RETURNING *",
      [relationshipId, controllerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Relationship not found" });
    }

    res.json({
      success: true,
      message: "Host relationship removed successfully",
    });
  } catch (error) {
    console.error("Remove host error:", error);
    res.status(500).json({ error: "Failed to remove host" });
  }
});

// ========== HOST ENDPOINTS ==========

// Get pending connection requests for host
app.get("/api/host/requests", verifyToken, async (req, res) => {
  try {
    const hostId = req.user.id;

    // Get pending requests where this user is the host
    const requestsResult = await pool.query(
      `
      SELECT 
        u.id AS user_id,
        u.google_id,
        u.name AS display_name,
        u.email,
        u.avatar_url AS profile_image,
        hr.relationship_id,
        hr.status,
        hr.invitation_message,
        hr.created_at
      FROM host_relationships hr
      JOIN users u ON hr.controller_user_id = u.id
      WHERE hr.host_user_id = $1 AND hr.status = 'pending'
      ORDER BY hr.created_at DESC
    `,
      [hostId]
    );

    res.json({
      success: true,
      requests: requestsResult.rows,
    });
  } catch (error) {
    console.error("Get host requests error:", error);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// Get active controllers for host
app.get("/api/host/controllers", verifyToken, async (req, res) => {
  try {
    const hostId = req.user.id;

    // Get active controllers for this host
    const controllersResult = await pool.query(
      `
      SELECT 
        u.id AS user_id,
        u.google_id,
        u.name AS display_name,
        u.email,
        u.avatar_url AS profile_image,
        hr.relationship_id,
        hr.status,
        hr.created_at,
        hr.updated_at
      FROM host_relationships hr
      JOIN users u ON hr.controller_user_id = u.id
      WHERE hr.host_user_id = $1 AND hr.status = 'active'
      ORDER BY u.name ASC
    `,
      [hostId]
    );

    res.json({
      success: true,
      controllers: controllersResult.rows,
    });
  } catch (error) {
    console.error("Get host controllers error:", error);
    res.status(500).json({ error: "Failed to fetch controllers" });
  }
});

// Accept connection request
app.post(
  "/api/host/requests/:relationshipId/accept",
  verifyToken,
  async (req, res) => {
    try {
      const hostId = req.user.id;
      const relationshipId = req.params.relationshipId;

      // Update relationship status to active
      const result = await pool.query(
        "UPDATE host_relationships SET status = 'active', updated_at = NOW() WHERE relationship_id = $1 AND host_user_id = $2 AND status = 'pending' RETURNING *",
        [relationshipId, hostId]
      );

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Request not found or already processed" });
      }

      res.json({
        success: true,
        message: "Request accepted successfully",
      });
    } catch (error) {
      console.error("Accept request error:", error);
      res.status(500).json({ error: "Failed to accept request" });
    }
  }
);

// Reject connection request
app.post(
  "/api/host/requests/:relationshipId/reject",
  verifyToken,
  async (req, res) => {
    try {
      const hostId = req.user.id;
      const relationshipId = req.params.relationshipId;

      // Update relationship status to rejected
      const result = await pool.query(
        "UPDATE host_relationships SET status = 'rejected', updated_at = NOW() WHERE relationship_id = $1 AND host_user_id = $2 AND status = 'pending' RETURNING *",
        [relationshipId, hostId]
      );

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Request not found or already processed" });
      }

      res.json({
        success: true,
        message: "Request rejected successfully",
      });
    } catch (error) {
      console.error("Reject request error:", error);
      res.status(500).json({ error: "Failed to reject request" });
    }
  }
);

// Revoke controller access
app.delete(
  "/api/host/controllers/:relationshipId",
  verifyToken,
  async (req, res) => {
    try {
      const hostId = req.user.id;
      const relationshipId = req.params.relationshipId;

      // Delete or update relationship
      const result = await pool.query(
        "DELETE FROM host_relationships WHERE relationship_id = $1 AND host_user_id = $2 RETURNING *",
        [relationshipId, hostId]
      );

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Controller relationship not found" });
      }

      res.json({
        success: true,
        message: "Controller access revoked successfully",
      });
    } catch (error) {
      console.error("Revoke controller error:", error);
      res.status(500).json({ error: "Failed to revoke access" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
