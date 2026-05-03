const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "dev-secret";
const adminLogin = process.env.ADMIN_LOGIN || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const uploadsDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const feedUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mt = file.mimetype || "";
    const ok =
      mt === "image/jpeg" ||
      mt === "image/png" ||
      mt === "video/mp4" ||
      mt.startsWith("application/");
    if (ok) cb(null, true);
    else cb(new Error("Only JPG, PNG, MP4 or generic files are allowed"));
  },
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
app.use("/uploads", express.static(uploadsDir));

const loginSchema = z.string().regex(/^[a-z]+$/, "login must be lowercase latin letters");
const registerSchema = z.object({
  login: loginSchema,
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
});
const authSchema = z.object({ login: loginSchema, password: z.string().min(6) });

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

const adminOnly = (req, res, next) => (req.user?.isAdmin ? next() : res.status(403).json({ error: "Forbidden" }));
const tapLimiter = new Map();
const feedPostTimestamps = new Map();
let io = null;

const feedPostRateOk = (userId) => {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 12;
  let arr = feedPostTimestamps.get(userId) || [];
  arr = arr.filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  feedPostTimestamps.set(userId, arr);
  return true;
};

const feedReactionCounts = async (postId) => {
  const rows = await prisma.feedPostReaction.groupBy({
    by: ["type"],
    where: { postId },
    _count: { _all: true },
  });
  const likeCount = rows.find((r) => r.type === "like")?._count._all ?? 0;
  const poopCount = rows.find((r) => r.type === "poop")?._count._all ?? 0;
  return { likeCount, poopCount };
};

const buildFeedItems = async (posts, viewerId) => {
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);
  const groupCounts = await prisma.feedPostReaction.groupBy({
    by: ["postId", "type"],
    where: { postId: { in: ids } },
    _count: { _all: true },
  });
  const countByPost = {};
  for (const row of groupCounts) {
    if (!countByPost[row.postId]) countByPost[row.postId] = { like: 0, poop: 0 };
    countByPost[row.postId][row.type] = row._count._all;
  }
  const mine = await prisma.feedPostReaction.findMany({
    where: { postId: { in: ids }, userId: viewerId },
  });
  const myByPost = Object.fromEntries(mine.map((r) => [r.postId, r.type]));
  return posts.map((p) => {
    const c = countByPost[p.id] || { like: 0, poop: 0 };
    return {
      id: p.id,
      text: p.text,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      author: p.author,
      media: p.media,
      likeCount: c.like,
      poopCount: c.poop,
      myReaction: myByPost[p.id] || null,
      commentCount: 0,
    };
  });
};

const canAccessChat = async (chatId, userId) => {
  const participant = await prisma.chatParticipant.findFirst({ where: { chatId, userId } });
  return Boolean(participant);
};

const seedAdminAndCards = async () => {
  const hash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { login: adminLogin },
    update: {},
    create: { login: adminLogin, passwordHash: hash, isAdmin: true, avatarUrl: "https://placehold.co/64x64?text=A" },
  });

  const cardCount = await prisma.card.count();
  if (!cardCount) {
    await prisma.card.createMany({
      data: [
        { name: "Влад Рекрут", rarity: "standard", basePrice: 50 },
        { name: "Влад Тень", rarity: "standard", basePrice: 75 },
        { name: "Влад Призрак", rarity: "standard", basePrice: 95 },
        { name: "Влад Легенда", rarity: "legendary", basePrice: 500, imageUrl: "https://placehold.co/300x420/gold/000?text=Legend" },
        { name: "Влад Абсолют", rarity: "diamond", basePrice: 1000, imageUrl: "https://placehold.co/300x420/89CFF0/000?text=Diamond" },
      ],
    });
  }
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, caseOpenPrice: 100, gameCircleImageUrl: "" },
  });
};

const freeOpenAvailable = (user) => {
  if (user.freeCaseOpens > 0) return true;
  if (!user.lastFreeCaseOpenedAt) return true;
  return Date.now() - new Date(user.lastFreeCaseOpenedAt).getTime() >= 5 * 60 * 1000;
};

const freeOpenCooldownSeconds = (user) => {
  if (user.freeCaseOpens > 0) return 0;
  if (!user.lastFreeCaseOpenedAt) return 0;
  const elapsed = Date.now() - new Date(user.lastFreeCaseOpenedAt).getTime();
  return Math.ceil(Math.max(0, 5 * 60 * 1000 - elapsed) / 1000);
};

app.post("/api/auth/register", async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    if (data.password !== data.confirmPassword) return res.status(400).json({ error: "Passwords do not match" });

    const exists = await prisma.user.findUnique({ where: { login: data.login } });
    if (exists) return res.status(409).json({ error: "User already exists" });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({ data: { login: data.login, passwordHash } });
    const token = jwt.sign({ id: user.id, login: user.login, isAdmin: user.isAdmin }, jwtSecret, { expiresIn: "30m" });
    res.json({ token, user: { id: user.id, login: user.login, balance: user.balance, isAdmin: user.isAdmin } });
  } catch (e) {
    res.status(400).json({ error: e.message || "Validation failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const data = authSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { login: data.login } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, login: user.login, isAdmin: user.isAdmin }, jwtSecret, { expiresIn: "30m" });
    res.json({ token, user: { id: user.id, login: user.login, balance: user.balance, isAdmin: user.isAdmin } });
  } catch (e) {
    res.status(400).json({ error: e.message || "Validation failed" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/users/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { inventory: { include: { card: true } } },
  });
  res.json(user);
});

app.get("/api/users", auth, async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const users = await prisma.user.findMany({
    where: {
      id: { not: req.user.id },
      ...(q ? { login: { contains: q, mode: "insensitive" } } : {}),
    },
    select: { id: true, login: true, avatarUrl: true },
    orderBy: { login: "asc" },
    take: 50,
  });
  res.json(users);
});

app.get("/api/cases/state", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  res.json({
    paidPrice: config?.caseOpenPrice ?? 100,
    canOpenFree: freeOpenAvailable(user),
    freeOpenCooldownSeconds: freeOpenCooldownSeconds(user),
    freeOpensLeft: user.freeCaseOpens,
  });
});

app.get("/api/cases/cards", auth, async (_req, res) => {
  const cards = await prisma.card.findMany({ orderBy: { id: "asc" } });
  res.json(cards);
});

app.post("/api/cases/open", auth, async (req, res) => {
  const payload = z.object({ mode: z.enum(["free", "paid"]).default("free") }).parse(req.body || {});
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const cards = await prisma.card.findMany();
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const paidPrice = config?.caseOpenPrice ?? 100;
  if (!cards.length) return res.status(400).json({ error: "No cards configured" });

  const canOpenFree = freeOpenAvailable(user);
  if (payload.mode === "free" && !canOpenFree) return res.status(400).json({ error: "Free opening is not available yet" });
  if (payload.mode === "paid" && user.balance < paidPrice) return res.status(400).json({ error: "Not enough balance" });

  const rarityPool = [
    ...cards.filter((c) => c.rarity === "standard"),
    ...cards.filter((c) => c.rarity === "standard"),
    ...cards.filter((c) => c.rarity === "standard"),
    ...cards.filter((c) => c.rarity === "legendary"),
    ...cards.filter((c) => c.rarity === "diamond"),
  ];
  const reward = rarityPool[Math.floor(Math.random() * rarityPool.length)];

  await prisma.$transaction(async (tx) => {
    await tx.userInventory.create({ data: { userId: user.id, cardId: reward.id } });
    if (payload.mode === "free") {
      const nextFree = user.freeCaseOpens > 0 ? user.freeCaseOpens - 1 : 0;
      await tx.user.update({
        where: { id: user.id },
        data: { freeCaseOpens: nextFree, lastFreeCaseOpenedAt: new Date() },
      });
    } else {
      await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: paidPrice } } });
      await tx.transaction.create({ data: { userId: user.id, amount: -paidPrice, reason: "Paid case opening" } });
    }
  });

  res.json({ reward, animationDurationMs: 5000 });
});

app.get("/api/marketplace/listings", async (_req, res) => {
  const listings = await prisma.marketplaceListing.findMany({
    where: { status: "active" },
    include: { card: true, seller: { select: { login: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(listings);
});

app.post("/api/marketplace/list", auth, async (req, res) => {
  const payload = z.object({ cardId: z.number(), price: z.number().min(1) }).parse(req.body);
  const item = await prisma.userInventory.findFirst({ where: { userId: req.user.id, cardId: payload.cardId }, include: { card: true } });
  if (!item) return res.status(404).json({ error: "Card not found in inventory" });
  const listing = await prisma.marketplaceListing.create({ data: { sellerId: req.user.id, cardId: payload.cardId, price: payload.price } });
  await prisma.userInventory.delete({ where: { id: item.id } });
  res.json(listing);
});

app.post("/api/marketplace/buy/:id", auth, async (req, res) => {
  const listingId = Number(req.params.id);
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "active") return res.status(404).json({ error: "Listing not found" });
  if (listing.sellerId === req.user.id) return res.status(400).json({ error: "Cannot buy your own listing" });

  const buyer = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (buyer.balance < listing.price) return res.status(400).json({ error: "Not enough balance" });

  await prisma.$transaction(async (tx) => {
    await tx.marketplaceListing.update({
      where: { id: listingId },
      data: { status: "sold", buyerId: req.user.id, closedAt: new Date() },
    });
    await tx.userInventory.create({ data: { userId: req.user.id, cardId: listing.cardId } });
    await tx.user.update({ where: { id: req.user.id }, data: { balance: { decrement: listing.price } } });
    await tx.user.update({ where: { id: listing.sellerId }, data: { balance: { increment: listing.price } } });
  });
  res.json({ ok: true });
});

app.post("/api/marketplace/unlist/:id", auth, async (req, res) => {
  const listingId = Number(req.params.id);
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "active") return res.status(404).json({ error: "Listing not found" });
  if (listing.sellerId !== req.user.id) return res.status(403).json({ error: "Cannot unlist someone else's card" });

  await prisma.$transaction(async (tx) => {
    await tx.marketplaceListing.update({
      where: { id: listingId },
      data: { status: "cancelled", closedAt: new Date() },
    });
    await tx.userInventory.create({
      data: { userId: req.user.id, cardId: listing.cardId },
    });
  });

  res.json({ ok: true });
});

app.post("/api/game/tap", auth, async (req, res) => {
  const now = Date.now();
  const state = tapLimiter.get(req.user.id) || { secondWindowStart: now, secondCount: 0, minuteWindowStart: now, minuteCount: 0 };
  if (now - state.secondWindowStart >= 1000) {
    state.secondWindowStart = now;
    state.secondCount = 0;
  }
  if (now - state.minuteWindowStart >= 60_000) {
    state.minuteWindowStart = now;
    state.minuteCount = 0;
  }
  state.secondCount += 1;
  state.minuteCount += 1;
  tapLimiter.set(req.user.id, state);
  if (state.secondCount > 8 || state.minuteCount > 220) {
    return res.status(429).json({ error: "Too many taps. Slow down." });
  }
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { balance: { increment: 1 } } });
  res.json({ balance: user.balance });
});

app.get("/api/game/config", async (_req, res) => {
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  res.json({ gameCircleImageUrl: config?.gameCircleImageUrl || "" });
});

app.get("/api/leaderboard", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    select: { id: true, login: true, balance: true, avatarUrl: true },
    orderBy: { balance: "desc" },
    take: 100,
  });
  res.json(users);
});

// -------- Chat API --------
app.get("/api/chats", auth, async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();

  const chats = await prisma.chat.findMany({
    where: {
      participants: { some: { userId: req.user.id } },
    },
    include: {
      participants: { include: { user: { select: { id: true, login: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, login: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const mapped = await Promise.all(
    chats.map(async (c) => {
      const other = c.participants.map((p) => p.user).find((u) => u.id !== req.user.id) || c.participants[0]?.user;
      const last = c.messages[0] || null;
      const meParticipant = await prisma.chatParticipant.findFirst({ where: { chatId: c.id, userId: req.user.id } });
      const lastRead = meParticipant?.lastReadMessageId || 0;
      const unreadCount = await prisma.chatMessage.count({
        where: { chatId: c.id, deletedAt: null, id: { gt: lastRead }, senderId: { not: req.user.id } },
      });
      return {
        id: c.id,
        peer: other ? { id: other.id, login: other.login, avatarUrl: other.avatarUrl } : null,
        lastMessage: last
          ? { id: last.id, text: last.text, createdAt: last.createdAt, sender: last.sender }
          : null,
        updatedAt: c.updatedAt,
        unreadCount,
      };
    })
  );

  const filtered = mapped.filter((c) => (q ? c.peer?.login?.toLowerCase().includes(q) : true));

  res.json(filtered);
});

app.get("/api/chats/:chatId/messages", auth, async (req, res) => {
  const chatId = Number(req.params.chatId);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;
  const take = Math.min(50, Math.max(10, Number(req.query.take || 30)));

  if (!(await canAccessChat(chatId, req.user.id))) return res.status(403).json({ error: "Forbidden" });

  const messages = await prisma.chatMessage.findMany({
    where: { chatId, deletedAt: null },
    orderBy: { id: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      sender: { select: { id: true, login: true, avatarUrl: true } },
      attachments: true,
    },
  });

  const hasMore = messages.length > take;
  const page = hasMore ? messages.slice(0, take) : messages;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  res.json({ items: page.reverse(), nextCursor });
});

app.post("/api/chats/with/:userId", auth, async (req, res) => {
  const peerId = Number(req.params.userId);
  if (!peerId || peerId === req.user.id) return res.status(400).json({ error: "Invalid peer" });
  const peer = await prisma.user.findUnique({ where: { id: peerId }, select: { id: true } });
  if (!peer) return res.status(404).json({ error: "User not found" });

  const existing = await prisma.chat.findFirst({
    where: { participants: { every: { userId: { in: [req.user.id, peerId] } } } },
    include: { participants: true },
  });
  if (existing && existing.participants.length === 2) return res.json({ id: existing.id });

  const chat = await prisma.chat.create({
    data: { participants: { createMany: { data: [{ userId: req.user.id }, { userId: peerId }] } } },
  });
  res.json({ id: chat.id });
});

app.post("/api/chats/:chatId/messages", auth, async (req, res) => {
  const chatId = Number(req.params.chatId);
  const payload = z
    .object({
      text: z.string().max(4000).optional().default(""),
      attachments: z
        .array(
          z.object({
            url: z.string().min(1),
            filename: z.string().min(1),
            mimeType: z.string().min(1),
            sizeBytes: z.number().int().nonnegative(),
          })
        )
        .optional()
        .default([]),
    })
    .parse(req.body || {});
  if (!(await canAccessChat(chatId, req.user.id))) return res.status(403).json({ error: "Forbidden" });
  if (!payload.text.trim() && payload.attachments.length === 0) return res.status(400).json({ error: "Empty message" });

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.chatMessage.create({
      data: {
        chatId,
        senderId: req.user.id,
        text: payload.text,
        attachments: payload.attachments.length
          ? {
              createMany: {
                data: payload.attachments.map((a) => ({
                  url: a.url,
                  filename: a.filename,
                  mimeType: a.mimeType,
                  sizeBytes: a.sizeBytes,
                })),
              },
            }
          : undefined,
      },
      include: { sender: { select: { id: true, login: true, avatarUrl: true } }, attachments: true },
    });
    await tx.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
    return msg;
  });

  io.to(`chat:${chatId}`).emit("chat:new_message", { chatId, message });
  res.json(message);
});

app.post("/api/chats/:chatId/read", auth, async (req, res) => {
  const chatId = Number(req.params.chatId);
  const payload = z.object({ lastReadMessageId: z.number().int().nonnegative() }).parse(req.body || {});
  if (!(await canAccessChat(chatId, req.user.id))) return res.status(403).json({ error: "Forbidden" });
  await prisma.chatParticipant.updateMany({
    where: { chatId, userId: req.user.id },
    data: { lastReadMessageId: payload.lastReadMessageId },
  });
  res.json({ ok: true });
});

// Upload attachments (images/files) -> returns uploaded file meta, then attach via message creation
app.post("/api/chat/attachments/upload", auth, upload.array("files", 5), async (req, res) => {
  const files = req.files || [];
  const mapped = files.map((f) => ({
    url: `/uploads/${f.filename}`,
    filename: f.originalname,
    mimeType: f.mimetype,
    sizeBytes: f.size,
  }));
  res.json({ items: mapped });
});

// -------- Feed (лента) --------
app.get("/api/feed", auth, async (req, res) => {
  const mediaOnly = req.query.mediaOnly === "1" || req.query.mediaOnly === "true";
  const take = Math.min(30, Math.max(5, Number(req.query.take || 15)));
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;

  const where = {
    ...(cursor ? { id: { lt: cursor } } : {}),
    ...(mediaOnly ? { media: { some: {} } } : {}),
  };

  const rows = await prisma.feedPost.findMany({
    where,
    orderBy: { id: "desc" },
    take: take + 1,
    include: {
      author: { select: { id: true, login: true, avatarUrl: true } },
      media: true,
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  const items = await buildFeedItems(page, req.user.id);
  res.json({ items, nextCursor });
});

app.post("/api/feed/upload", auth, feedUpload.array("files", 6), async (req, res) => {
  const files = req.files || [];
  const mapped = files.map((f) => ({
    url: `/uploads/${f.filename}`,
    filename: f.originalname,
    mimeType: f.mimetype,
    sizeBytes: f.size,
  }));
  res.json({ items: mapped });
});

app.post("/api/feed/posts", auth, async (req, res) => {
  if (!feedPostRateOk(req.user.id)) {
    return res.status(429).json({ error: "Слишком много постов. Подожди минуту." });
  }
  const payload = z
    .object({
      text: z.string().max(8000).optional().default(""),
      media: z
        .array(
          z.object({
            url: z.string().min(1),
            filename: z.string().min(1),
            mimeType: z.string().min(1),
            sizeBytes: z.number().int().nonnegative(),
          })
        )
        .optional()
        .default([]),
    })
    .parse(req.body || {});

  const text = payload.text.trim();
  if (!text && payload.media.length === 0) {
    return res.status(400).json({ error: "Добавь текст или медиа" });
  }

  const post = await prisma.feedPost.create({
    data: {
      authorId: req.user.id,
      text,
      ...(payload.media.length
        ? {
            media: {
              createMany: {
                data: payload.media.map((m) => ({
                  url: m.url,
                  filename: m.filename,
                  mimeType: m.mimeType,
                  sizeBytes: m.sizeBytes,
                })),
              },
            },
          }
        : {}),
    },
    include: {
      author: { select: { id: true, login: true, avatarUrl: true } },
      media: true,
    },
  });

  const [item] = await buildFeedItems([post], req.user.id);
  if (io) io.to("feed").emit("feed:new_post", { post: item });
  res.json(item);
});

app.post("/api/feed/posts/:id/reaction", auth, async (req, res) => {
  const postId = Number(req.params.id);
  const payload = z.object({ type: z.enum(["like", "poop"]) }).parse(req.body || {});
  const post = await prisma.feedPost.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "Пост не найден" });

  const existing = await prisma.feedPostReaction.findUnique({
    where: { postId_userId: { postId, userId: req.user.id } },
  });

  let myReaction = null;
  if (!existing) {
    await prisma.feedPostReaction.create({
      data: { postId, userId: req.user.id, type: payload.type },
    });
    myReaction = payload.type;
  } else if (existing.type === payload.type) {
    await prisma.feedPostReaction.delete({
      where: { postId_userId: { postId, userId: req.user.id } },
    });
    myReaction = null;
  } else {
    await prisma.feedPostReaction.update({
      where: { postId_userId: { postId, userId: req.user.id } },
      data: { type: payload.type },
    });
    myReaction = payload.type;
  }

  const { likeCount, poopCount } = await feedReactionCounts(postId);
  if (io) io.to("feed").emit("feed:reaction", { postId, likeCount, poopCount });
  res.json({ postId, likeCount, poopCount, myReaction });
});

app.patch("/api/feed/posts/:id", auth, async (req, res) => {
  const postId = Number(req.params.id);
  const payload = z.object({ text: z.string().max(8000) }).parse(req.body || {});
  const post = await prisma.feedPost.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "Пост не найден" });
  if (post.authorId !== req.user.id) return res.status(403).json({ error: "Нельзя редактировать чужой пост" });

  const updated = await prisma.feedPost.update({
    where: { id: postId },
    data: { text: payload.text.trim() },
    include: {
      author: { select: { id: true, login: true, avatarUrl: true } },
      media: true,
    },
  });
  const [item] = await buildFeedItems([updated], req.user.id);
  if (io) io.to("feed").emit("feed:post_updated", { post: item });
  res.json(item);
});

app.delete("/api/feed/posts/:id", auth, async (req, res) => {
  const postId = Number(req.params.id);
  const post = await prisma.feedPost.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "Пост не найден" });
  if (post.authorId !== req.user.id) return res.status(403).json({ error: "Нельзя удалить чужой пост" });

  await prisma.feedPost.delete({ where: { id: postId } });
  if (io) io.to("feed").emit("feed:post_deleted", { postId });
  res.json({ ok: true });
});

app.post("/api/users/change-password", auth, async (req, res) => {
  const payload = z.object({ oldPassword: z.string().min(6), newPassword: z.string().min(6) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const ok = await bcrypt.compare(payload.oldPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Wrong current password" });
  const passwordHash = await bcrypt.hash(payload.newPassword, 10);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

app.post("/api/users/avatar", auth, async (req, res) => {
  const payload = z.object({ avatarUrl: z.string().url() }).parse(req.body);
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: payload.avatarUrl } });
  res.json({ avatarUrl: user.avatarUrl });
});

app.post("/api/users/avatar/upload", auth, upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Avatar file is required" });
  const avatarUrl = `/uploads/${req.file.filename}`;
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl } });
  res.json({ avatarUrl: user.avatarUrl });
});

app.post("/api/users/sell/:inventoryId", auth, async (req, res) => {
  const inventoryId = Number(req.params.inventoryId);
  const item = await prisma.userInventory.findUnique({ where: { id: inventoryId }, include: { card: true } });
  if (!item || item.userId !== req.user.id) return res.status(404).json({ error: "Not found" });
  await prisma.$transaction(async (tx) => {
    await tx.userInventory.delete({ where: { id: inventoryId } });
    await tx.user.update({ where: { id: req.user.id }, data: { balance: { increment: item.card.basePrice } } });
  });
  res.json({ ok: true, amount: item.card.basePrice });
});

app.post("/api/users/promocode", auth, async (req, res) => {
  const payload = z.object({ code: z.string().min(3) }).parse(req.body);
  const promo = await prisma.promocode.findUnique({ where: { code: payload.code } });
  if (!promo || !promo.isActive) return res.status(404).json({ error: "Promo not active" });
  await prisma.user.update({ where: { id: req.user.id }, data: { balance: { increment: promo.amount } } });
  res.json({ ok: true, amount: promo.amount });
});

app.get("/api/admin/users", auth, adminOnly, async (_req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, login: true, balance: true, isAdmin: true, avatarUrl: true } });
  res.json(users);
});

app.get("/api/admin/config", auth, adminOnly, async (_req, res) => {
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  res.json(config || { id: 1, caseOpenPrice: 100 });
});

app.patch("/api/admin/config", auth, adminOnly, async (req, res) => {
  const payload = z
    .object({
      caseOpenPrice: z.number().min(1).optional(),
      gameCircleImageUrl: z.string().optional(),
    })
    .parse(req.body);
  const config = await prisma.appConfig.upsert({
    where: { id: 1 },
    update: payload,
    create: { id: 1, caseOpenPrice: payload.caseOpenPrice ?? 100, gameCircleImageUrl: payload.gameCircleImageUrl || "" },
  });
  res.json(config);
});

app.post("/api/admin/game-circle/upload", auth, adminOnly, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image file is required" });
  const gameCircleImageUrl = `/uploads/${req.file.filename}`;
  const config = await prisma.appConfig.upsert({
    where: { id: 1 },
    update: { gameCircleImageUrl },
    create: { id: 1, caseOpenPrice: 100, gameCircleImageUrl },
  });
  res.json(config);
});

app.get("/api/admin/cards", auth, adminOnly, async (_req, res) => {
  const cards = await prisma.card.findMany({ orderBy: { id: "desc" } });
  res.json(cards);
});

app.post("/api/admin/cards", auth, adminOnly, async (req, res) => {
  const payload = z.object({
    name: z.string().min(2),
    rarity: z.enum(["standard", "legendary", "diamond"]),
    basePrice: z.number().min(1),
    imageUrl: z.string().url().optional(),
  }).parse(req.body);
  const card = await prisma.card.create({ data: payload });
  res.json(card);
});

app.post("/api/admin/cards/upload", auth, adminOnly, upload.single("image"), async (req, res) => {
  const payload = z.object({
    name: z.string().min(2),
    rarity: z.enum(["standard", "legendary", "diamond"]),
    basePrice: z.coerce.number().min(1),
  }).parse(req.body);
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : "https://placehold.co/300x420";
  const card = await prisma.card.create({ data: { ...payload, imageUrl } });
  res.json(card);
});

app.delete("/api/admin/cards/:id", auth, adminOnly, async (req, res) => {
  await prisma.card.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

app.patch("/api/admin/cards/:id", auth, adminOnly, async (req, res) => {
  const card = await prisma.card.update({
    where: { id: Number(req.params.id) },
    data: req.body,
  });
  res.json(card);
});

app.post("/api/admin/cards/:id/upload", auth, adminOnly, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image file is required" });
  const card = await prisma.card.update({
    where: { id: Number(req.params.id) },
    data: { imageUrl: `/uploads/${req.file.filename}` },
  });
  res.json(card);
});

app.post("/api/admin/promocodes", auth, adminOnly, async (req, res) => {
  const payload = z.object({ code: z.string().min(3), amount: z.number().min(1) }).parse(req.body);
  const promo = await prisma.promocode.create({ data: payload });
  res.json(promo);
});

app.get("/api/admin/promocodes", auth, adminOnly, async (_req, res) => {
  const promos = await prisma.promocode.findMany({ orderBy: { id: "desc" } });
  res.json(promos);
});

app.patch("/api/admin/promocodes/:id", auth, adminOnly, async (req, res) => {
  const promo = await prisma.promocode.update({ where: { id: Number(req.params.id) }, data: req.body });
  res.json(promo);
});

app.delete("/api/admin/promocodes/:id", auth, adminOnly, async (req, res) => {
  await prisma.promocode.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err.message || "Server error" });
});

seedAdminAndCards()
  .then(() => {
    const server = http.createServer(app);
    const ioServer = new Server(server, {
      cors: { origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true },
    });
    global.io = ioServer;
    io = ioServer;

    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
        if (!token) return next(new Error("Unauthorized"));
        const payload = jwt.verify(token, jwtSecret);
        socket.user = payload;
        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    });

    io.on("connection", (socket) => {
      socket.join("feed");
      socket.on("chat:join", async ({ chatId }) => {
        const id = Number(chatId);
        if (!id) return;
        const ok = await canAccessChat(id, socket.user.id);
        if (!ok) return;
        socket.join(`chat:${id}`);
      });
      socket.on("chat:leave", ({ chatId }) => {
        const id = Number(chatId);
        if (!id) return;
        socket.leave(`chat:${id}`);
      });
      socket.on("chat:typing", async ({ chatId, isTyping }) => {
        const id = Number(chatId);
        if (!id) return;
        const ok = await canAccessChat(id, socket.user.id);
        if (!ok) return;
        socket.to(`chat:${id}`).emit("chat:typing", { chatId: id, userId: socket.user.id, isTyping: Boolean(isTyping) });
      });
    });

    server.listen(port, () => console.log(`API listening on ${port}`));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
