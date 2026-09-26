import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import Razorpay from "razorpay";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 5000;

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production";

app.use(cors({
  origin: frontendUrl,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    })
  : null;

function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("paypilot_token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

async function auth(req, res, next) {
  try {
    const token = req.cookies.paypilot_token;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "PayPilot API" });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: "Name, valid email and password of 6+ characters are required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: "Email is already registered" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash }
  });

  setAuthCookie(res, user.id);
  res.status(201).json({ user: safeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email?.trim().toLowerCase() } });

  if (!user?.passwordHash || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  setAuthCookie(res, user.id);
  res.json({ user: safeUser(user) });
});

app.get("/api/auth/google", (req, res) => {
  const oauth2Client = getGoogleClient();
  if (!oauth2Client) return res.status(503).send("Google login is not configured.");
  const url = oauth2Client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "profile", "email"],
    prompt: "select_account"
  });
  res.redirect(url);
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const oauth2Client = getGoogleClient();
    if (!oauth2Client) return res.status(503).send("Google login is not configured.");

    const { code } = req.query;
    if (!code) return res.redirect(`${frontendUrl}/login?error=google_login_failed`);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const { data } = await oauth2.userinfo.get();

    if (!data.email) return res.redirect(`${frontendUrl}/login?error=no_email`);

    let user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: data.name || data.email.split("@")[0],
          email: data.email.toLowerCase(),
          googleId: data.id,
          avatarUrl: data.picture
        }
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: data.id, avatarUrl: data.picture || user.avatarUrl }
      });
    }

    setAuthCookie(res, user.id);
    res.redirect(`${frontendUrl}/dashboard`);
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${frontendUrl}/login?error=google_login_failed`);
  }
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("paypilot_token", { path: "/" });
  res.json({ ok: true });
});

app.post("/api/payments/create-order", auth, async (req, res) => {
  try {
    if (!razorpay) return res.status(503).json({ error: "Razorpay is not configured" });

    const amount = Number(req.body.amount);
    const description = String(req.body.description || "PayPilot payment").trim();

    if (!Number.isInteger(amount) || amount < 100) {
      return res.status(400).json({ error: "Amount must be an integer number of paise and at least ₹1" });
    }

    if (!description || description.length > 120) {
      return res.status(400).json({ error: "Description is required and must be under 120 characters" });
    }

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `pp_${crypto.randomBytes(8).toString("hex")}`,
      notes: { userId: req.user.id }
    });

    const payment = await prisma.payment.create({
      data: {
        userId: req.user.id,
        amount,
        currency: "INR",
        description,
        razorpayOrderId: order.id,
        status: "CREATED"
      }
    });

    res.json({
      paymentId: payment.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Create order:", error);
    res.status(500).json({ error: "Unable to create payment order" });
  }
});

app.post("/api/payments/verify", auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Incomplete Razorpay response" });
    }

    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: razorpay_order_id, userId: req.user.id }
    });

    if (!payment) return res.status(404).json({ error: "Payment order not found" });

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const valid = crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(razorpay_signature, "utf8")
    );

    if (!valid) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" }
      });
      return res.status(400).json({ error: "Payment signature verification failed" });
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date()
      }
    });

    res.json({ success: true, payment: updated });
  } catch (error) {
    console.error("Verify payment:", error);
    res.status(500).json({ error: "Unable to verify payment" });
  }
});

app.get("/api/payments", auth, async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  res.json({ payments });
});

app.get("/api/ideas", auth, async (req, res) => {
  const ideas = await prisma.paymentIdea.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" }
  });
  res.json({ ideas });
});

app.post("/api/ideas", auth, async (req, res) => {
  const { title, description, category, priority, status, notes } = req.body;
  if (!title || !description) return res.status(400).json({ error: "Title and description are required" });

  const idea = await prisma.paymentIdea.create({
    data: {
      userId: req.user.id,
      title: title.trim(),
      description: description.trim(),
      category: category || "Payments",
      priority: priority || "Medium",
      status: status || "IDEA",
      notes: notes || null
    }
  });

  res.status(201).json({ idea });
});

app.patch("/api/ideas/:id", auth, async (req, res) => {
  const existing = await prisma.paymentIdea.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });
  if (!existing) return res.status(404).json({ error: "Idea not found" });

  const allowed = ["title", "description", "category", "priority", "status", "notes"];
  const data = {};
  for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key];

  const idea = await prisma.paymentIdea.update({
    where: { id: existing.id },
    data
  });

  res.json({ idea });
});

app.delete("/api/ideas/:id", auth, async (req, res) => {
  const existing = await prisma.paymentIdea.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });
  if (!existing) return res.status(404).json({ error: "Idea not found" });

  await prisma.paymentIdea.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt
  };
}

function getGoogleClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
    return null;
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );
}

app.listen(port, () => {
  console.log(`PayPilot API running on port ${port}`);
});
