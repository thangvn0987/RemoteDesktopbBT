// Mint a short-lived JWT for local testing.
// Usage: node scripts/mint-token.js --session 123 --ttl 300
import "dotenv/config";
import jwt from "jsonwebtoken";

const args = process.argv.slice(2);
const get = (k, def) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const sessionId = get("session", "local");
const ttl = parseInt(get("ttl", "300"), 10);
const secret = process.env.SIGNING_SECRET || "dev-signing-secret";

const now = Math.floor(Date.now() / 1000);
const token = jwt.sign({ sessionId }, secret, {
  algorithm: "HS256",
  expiresIn: ttl,
  notBefore: 0,
  issuer: "signaling-local",
  subject: sessionId,
  iat: now,
});
console.log(token);
