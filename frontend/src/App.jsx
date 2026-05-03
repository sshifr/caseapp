import { useEffect, useMemo, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";
import "./App.css";
import GlitchText from "./components/GlitchText";
import FloatingLines from "./components/FloatingLines";
import GooeyNav from "./components/GooeyNav";
import ElectricBorder from "./components/ElectricBorder";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const API_BASE = API.replace(/\/api$/, "");
const tabs = ["Кейс", "Биржа", "Мини-игра", "Лидерборд", "Лента", "Чат", "Личный кабинет"];
const TOKEN_KEY = "case_app_token";

async function request(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const toAssetUrl = (url) => {
  if (!url) return "https://placehold.co/64x64";
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url}`;
};

const formatTime = (value) => {
  try {
    const d = new Date(value);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const formatFeedDate = (value) => {
  try {
    const d = new Date(value);
    return d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
};

const Icon = ({ name }) => {
  if (name === "refresh") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 6a6 6 0 0 1 5.65 4H20a8 8 0 1 0 1.25 4H19a6 6 0 1 1-1.35-3.78L15 13h7V6l-2.2 2.2A9.98 9.98 0 0 0 12 4a10 10 0 1 0 0 20 10 10 0 0 0 9.95-9h-2.02A8 8 0 1 1 12 6Z"
        />
      </svg>
    );
  }
  if (name === "paperclip") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.5 6.5v9.25a4.25 4.25 0 0 1-8.5 0V6.25a2.75 2.75 0 1 1 5.5 0v9.1a1.25 1.25 0 0 1-2.5 0V7.5H9v7.85a3.25 3.25 0 0 0 6.5 0v-9.1a4.75 4.75 0 1 0-9.5 0v9.5a6.25 6.25 0 0 0 12.5 0V6.5h-2Z"
        />
      </svg>
    );
  }
  if (name === "send") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8L6.4 12.4 5 11l7-7Z" />
      </svg>
    );
  }
  return null;
};

function App() {
  const [form, setForm] = useState({ login: "", password: "", confirmPassword: "" });
  const [authMode, setAuthMode] = useState("login");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("Кейс");
  const [rewardCard, setRewardCard] = useState("");
  const [isOpeningCase, setIsOpeningCase] = useState(false);
  const [caseCards, setCaseCards] = useState([]);
  const [rouletteCards, setRouletteCards] = useState([]);
  const [rouletteOffset, setRouletteOffset] = useState(0);
  const [isRouletteSpinning, setIsRouletteSpinning] = useState(false);
  const [winningRouletteIndex, setWinningRouletteIndex] = useState(-1);
  const reelViewportRef = useRef(null);
  const reelTrackRef = useRef(null);
  const [caseState, setCaseState] = useState({ paidPrice: 100, canOpenFree: true, freeOpenCooldownSeconds: 0, freeOpensLeft: 0 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [marketListings, setMarketListings] = useState([]);
  const [listingCardId, setListingCardId] = useState("");
  const [listingPrice, setListingPrice] = useState("100");
  const [alerts, setAlerts] = useState([]);
  const [avatarFile, setAvatarFile] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [passwords, setPasswords] = useState({ oldPassword: "", newPassword: "" });
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminCards, setAdminCards] = useState([]);
  const [adminPromos, setAdminPromos] = useState([]);
  const [newCard, setNewCard] = useState({ name: "", rarity: "standard", basePrice: 100 });
  const [newCardImage, setNewCardImage] = useState(null);
  const [cardImageEdits, setCardImageEdits] = useState({});
  const [newPromo, setNewPromo] = useState({ code: "", amount: 100 });
  const [caseOpenPrice, setCaseOpenPrice] = useState(100);
  const [gameCircleImageUrl, setGameCircleImageUrl] = useState("");
  const [gameCircleImageFile, setGameCircleImageFile] = useState(null);
  const [tapHearts, setTapHearts] = useState([]);
  const [emojiRain, setEmojiRain] = useState([]);
  const [dancingCard, setDancingCard] = useState(null);
  const audioRef = useRef(null);
  const effectIntervalRef = useRef(null);
  const effectTimeoutRef = useRef(null);

  // ---- Chat state ----
  const [chatQuery, setChatQuery] = useState("");
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatNextCursor, setChatNextCursor] = useState(null);
  const [chatHasMore, setChatHasMore] = useState(true);
  const [chatText, setChatText] = useState("");
  const [chatAttachments, setChatAttachments] = useState([]);
  const [chatUploading, setChatUploading] = useState(false);
  const [chatTyping, setChatTyping] = useState(false);
  const chatListRef = useRef(null);
  const chatScrollRef = useRef(null);
  const socketRef = useRef(null);
  const [chatUsersQuery, setChatUsersQuery] = useState("");
  const [chatUsers, setChatUsers] = useState([]);

  const [feedPosts, setFeedPosts] = useState([]);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedMediaOnly, setFeedMediaOnly] = useState(false);
  const [feedText, setFeedText] = useState("");
  const [feedStaging, setFeedStaging] = useState([]);
  const [feedPublishing, setFeedPublishing] = useState(false);
  const [feedEditing, setFeedEditing] = useState(null);
  const [feedEditText, setFeedEditText] = useState("");
  const feedScrollRef = useRef(null);
  const tabRef = useRef(tab);
  const feedSyncRef = useRef({ posts: [], hasMore: true, loadingMore: false, mediaOnly: false });
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMobileChatDialog, setShowMobileChatDialog] = useState(false);

  const inventory = useMemo(() => user?.inventory || [], [user]);
  const activeTabIndex = tabs.findIndex((item) => item === tab);
  const totalUnread = useMemo(() => chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0), [chats]);
  const navItems = useMemo(() => tabs.map((label) => ({ label, dot: label === "Чат" && totalUnread > 0 })), [totalUnread]);
  const floatingEnabledWaves = useMemo(() => ["top", "middle", "bottom"], []);
  const floatingGradient = useMemo(() => ["#e945f5", "#6f6f6f", "#6a6a6a"], []);

  const pushAlert = (type, message) => {
    const id = Date.now() + Math.random();
    setAlerts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), 3200);
  };

  const stopRewardEffects = () => {
    if (effectIntervalRef.current) {
      clearInterval(effectIntervalRef.current);
      effectIntervalRef.current = null;
    }
    if (effectTimeoutRef.current) {
      clearTimeout(effectTimeoutRef.current);
      effectTimeoutRef.current = null;
    }
    setEmojiRain([]);
    setDancingCard(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const triggerRewardEffects = (card) => {
    stopRewardEffects();
    if (card.rarity === "standard") return;
    const isDiamond = card.rarity === "diamond";
    const emojiSet = isDiamond ? ["💖"] : ["🔥", "🎉", "✨", "💥", "🌟", "🪩", "🎊", "😎"];
    const effectDurationMs = isDiamond ? 14000 : 3600;
    effectIntervalRef.current = window.setInterval(() => {
      setEmojiRain((prev) => [
        ...prev,
        ...Array.from({ length: 8 }).map((_, idx) => ({
          id: Date.now() + Math.random() + idx,
          emoji: emojiSet[Math.floor(Math.random() * emojiSet.length)],
          left: Math.random() * 96,
          duration: 2.4 + Math.random() * 1.8,
          size: 20 + Math.round(Math.random() * 18),
          delay: Math.random() * 0.2,
        })),
      ]);
    }, 180);

    effectTimeoutRef.current = window.setTimeout(() => {
      if (effectIntervalRef.current) {
        clearInterval(effectIntervalRef.current);
        effectIntervalRef.current = null;
      }
      setEmojiRain([]);
      if (isDiamond) {
        setDancingCard(null);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      }
    }, effectDurationMs);

    if (isDiamond) {
      setDancingCard(card);
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const handleLogout = async () => {
    try {
      if (token) await request("/auth/logout", token, { method: "POST" });
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setLeaderboard([]);
    setMarketListings([]);
  };

  const loadChats = async () => {
    try {
      const data = await request(`/chats?q=${encodeURIComponent(chatQuery)}`, token);
      setChats(data);
      if (!activeChatId && data[0]?.id) setActiveChatId(data[0].id);
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadChatUsers = async () => {
    try {
      const data = await request(`/users?q=${encodeURIComponent(chatUsersQuery)}`, token);
      setChatUsers(data);
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const ensureChatWithUser = async (peerId) => {
    try {
      const data = await request(`/chats/with/${peerId}`, token, { method: "POST" });
      setActiveChatId(data.id);
      setTab("Чат");
      await loadChats();
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadChatMessages = async (chatId, cursor = null) => {
    try {
      const qs = new URLSearchParams();
      if (cursor) qs.set("cursor", String(cursor));
      qs.set("take", "30");
      const data = await request(`/chats/${chatId}/messages?${qs.toString()}`, token);
      setChatNextCursor(data.nextCursor);
      setChatHasMore(Boolean(data.nextCursor));
      if (cursor) {
        setChatMessages((prev) => [...data.items, ...prev]);
      } else {
        setChatMessages(data.items);
        requestAnimationFrame(() => {
          const el = chatScrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
      // mark as read up to latest message
      const last = data.items?.[data.items.length - 1];
      if (last?.id) {
        request(`/chats/${chatId}/read`, token, { method: "POST", body: JSON.stringify({ lastReadMessageId: last.id }) }).catch(() => {});
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
      }
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const sendChatMessage = async () => {
    if (!activeChatId) return;
    const trimmed = chatText.trim();
    if (!trimmed && chatAttachments.length === 0) return;
    try {
      setChatUploading(true);
      let uploaded = [];
      if (chatAttachments.length) {
        const formData = new FormData();
        chatAttachments.forEach((f) => formData.append("files", f));
        const res = await fetch(`${API}/chat/attachments/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        uploaded = data.items || [];
      }

      const message = await request(`/chats/${activeChatId}/messages`, token, {
        method: "POST",
        body: JSON.stringify({ text: chatText, attachments: uploaded }),
      });
      setChatText("");
      setChatAttachments([]);
      setChatMessages((prev) => [...prev, message]);
      setChats((prev) => {
        const next = prev.map((c) => (c.id === activeChatId ? { ...c, lastMessage: { id: message.id, text: message.text, createdAt: message.createdAt, sender: message.sender }, updatedAt: new Date().toISOString() } : c));
        next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return next;
      });
      requestAnimationFrame(() => {
        const el = chatScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (e) {
      pushAlert("error", e.message);
    } finally {
      setChatUploading(false);
    }
  };

  const clearFeedStaging = () => {
    setFeedStaging((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
  };

  const addFeedFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setFeedStaging((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeFeedStagingItem = (id) => {
    setFeedStaging((prev) => {
      const t = prev.find((x) => x.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return prev.filter((x) => x.id !== id);
    });
  };

  const feedAppendLock = useRef(false);

  const loadMoreFeed = async () => {
    if (!token || tabRef.current !== "Лента") return;
    const r = feedSyncRef.current;
    if (!r.hasMore || r.loadingMore || feedAppendLock.current) return;
    const oldest = r.posts[r.posts.length - 1]?.id;
    if (!oldest) return;
    feedAppendLock.current = true;
    setFeedLoadingMore(true);
    try {
      const qs = new URLSearchParams();
      qs.set("take", "15");
      qs.set("cursor", String(oldest));
      if (r.mediaOnly) qs.set("mediaOnly", "1");
      const data = await request(`/feed?${qs}`, token);
      setFeedHasMore(Boolean(data.nextCursor));
      setFeedPosts((prev) => [...prev, ...data.items]);
    } catch (e) {
      pushAlert("error", e.message);
    } finally {
      feedAppendLock.current = false;
      setFeedLoadingMore(false);
    }
  };

  const publishFeedPost = async () => {
    const trimmed = feedText.trim();
    if (!trimmed && feedStaging.length === 0) return;
    try {
      setFeedPublishing(true);
      let uploaded = [];
      if (feedStaging.length) {
        const formData = new FormData();
        feedStaging.forEach((s) => formData.append("files", s.file));
        const res = await fetch(`${API}/feed/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не удалось загрузить файлы");
        uploaded = data.items || [];
      }
      const post = await request("/feed/posts", token, {
        method: "POST",
        body: JSON.stringify({ text: feedText, media: uploaded }),
      });
      setFeedText("");
      clearFeedStaging();
      setFeedPosts((prev) => {
        if (prev.some((p) => p.id === post.id)) return prev;
        return [post, ...prev];
      });
    } catch (e) {
      pushAlert("error", e.message);
    } finally {
      setFeedPublishing(false);
    }
  };

  const toggleFeedReaction = async (post, type) => {
    try {
      const data = await request(`/feed/posts/${post.id}/reaction`, token, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      setFeedPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, likeCount: data.likeCount, poopCount: data.poopCount, myReaction: data.myReaction } : p
        )
      );
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const deleteFeedPost = async (id) => {
    try {
      await request(`/feed/posts/${id}`, token, { method: "DELETE" });
      setFeedPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const saveFeedEdit = async () => {
    if (!feedEditing) return;
    try {
      const updated = await request(`/feed/posts/${feedEditing}`, token, {
        method: "PATCH",
        body: JSON.stringify({ text: feedEditText }),
      });
      setFeedPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setFeedEditing(null);
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadProfile = async (jwt = token) => {
    try {
      const me = await request("/users/me", jwt);
      setUser(me);
    } catch (e) {
      if (e.message.toLowerCase().includes("token") || e.message.toLowerCase().includes("unauthorized")) {
        handleLogout();
        pushAlert("error", "Сессия истекла. Войдите снова.");
        return;
      }
      pushAlert("error", e.message);
    }
  };

  const loadListings = async (jwt = token) => {
    try {
      setMarketListings(await request("/marketplace/listings", jwt));
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadLeaderboard = async () => {
    try {
      setLeaderboard(await request("/leaderboard", token));
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadAdminData = async () => {
    try {
      const [users, cards, promos, config] = await Promise.all([
        request("/admin/users", token),
        request("/admin/cards", token),
        request("/admin/promocodes", token),
        request("/admin/config", token),
      ]);
      setAdminUsers(users);
      setAdminCards(cards);
      setAdminPromos(promos);
      setCaseOpenPrice(config.caseOpenPrice);
      setGameCircleImageUrl(config.gameCircleImageUrl || "");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadCaseState = async (jwt = token) => {
    try {
      const state = await request("/cases/state", jwt);
      setCaseState(state);
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadCaseCards = async (jwt = token) => {
    try {
      const cards = await request("/cases/cards", jwt);
      setCaseCards(cards);
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const loadGameConfig = async (jwt = token) => {
    try {
      const config = await request("/game/config", jwt);
      setGameCircleImageUrl(config.gameCircleImageUrl || "");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const body =
        authMode === "login"
          ? { login: form.login, password: form.password }
          : { login: form.login, password: form.password, confirmPassword: form.confirmPassword };
      const data = await request(endpoint, "", { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      pushAlert("success", "Успешный вход.");
    } catch (e2) {
      pushAlert("error", e2.message);
    }
  };

  const handleCaseOpen = async (mode) => {
    try {
      setIsOpeningCase(true);
      const data = await request("/cases/open", token, { method: "POST", body: JSON.stringify({ mode }) });
      const pool = caseCards.length ? caseCards : [data.reward];
      const total = 56;
      const winnerIndex = 40 + Math.floor(Math.random() * 10);
      const items = Array.from({ length: total }, () => pool[Math.floor(Math.random() * pool.length)]);
      items[winnerIndex] = data.reward;
      setRouletteCards(items);
      setWinningRouletteIndex(winnerIndex);
      setIsRouletteSpinning(false);
      setRouletteOffset(0);
      setRewardCard("");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const viewport = reelViewportRef.current;
          const track = reelTrackRef.current;
          const winner = track?.children?.[winnerIndex];
          if (!viewport || !track || !winner) return;
          const viewportWidth = viewport.clientWidth;
          const winnerCenter = winner.offsetLeft + winner.clientWidth / 2;
          const target = Math.max(0, winnerCenter - viewportWidth / 2);
          setIsRouletteSpinning(true);
          setRouletteOffset(target);
        });
      });

      setTimeout(() => {
        setIsRouletteSpinning(false);
        setRewardCard(`${data.reward.name} (${data.reward.rarity})`);
        triggerRewardEffects(data.reward);
        setIsOpeningCase(false);
        loadProfile(token);
        loadCaseState(token);
      }, 5600);
    } catch (e) {
      setIsOpeningCase(false);
      pushAlert("error", e.message);
    }
  };

  const handleTap = async (event) => {
    const heartId = Date.now() + Math.random();
    setTapHearts((prev) => [...prev, { id: heartId, x: event.clientX, y: event.clientY }]);
    window.setTimeout(() => {
      setTapHearts((prev) => prev.filter((h) => h.id !== heartId));
    }, 900);
    try {
      const data = await request("/game/tap", token, { method: "POST" });
      setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handleCreateListing = async () => {
    if (!listingCardId || Number(listingPrice) <= 0) return pushAlert("error", "Выберите карточку и цену.");
    try {
      await request("/marketplace/list", token, {
        method: "POST",
        body: JSON.stringify({ cardId: Number(listingCardId), price: Number(listingPrice) }),
      });
      await loadProfile();
      await loadListings();
      pushAlert("success", "Лот выставлен.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handleBuyListing = async (id) => {
    try {
      await request(`/marketplace/buy/${id}`, token, { method: "POST" });
      await loadProfile();
      await loadListings();
      pushAlert("success", "Покупка выполнена.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handleUnlist = async (id) => {
    try {
      await request(`/marketplace/unlist/${id}`, token, { method: "POST" });
      await loadProfile();
      await loadListings();
      pushAlert("success", "Лот снят с продажи. Карточка возвращена в инвентарь.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handleSellFromCabinet = async (inventoryId) => {
    try {
      await request(`/users/sell/${inventoryId}`, token, { method: "POST" });
      await loadProfile();
      pushAlert("success", "Карточка продана по базовой цене.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handleChangePassword = async () => {
    try {
      await request("/users/change-password", token, { method: "POST", body: JSON.stringify(passwords) });
      setPasswords({ oldPassword: "", newPassword: "" });
      pushAlert("success", "Пароль обновлен.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handleChangeAvatar = async () => {
    try {
      if (!avatarFile) return pushAlert("error", "Сначала выберите файл аватарки.");
      const formData = new FormData();
      formData.append("avatar", avatarFile);
      await fetch(`${API}/users/avatar/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        return data;
      });
      setAvatarFile(null);
      await loadProfile();
      pushAlert("success", "Аватар обновлен.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const handlePromoActivate = async () => {
    try {
      await request("/users/promocode", token, { method: "POST", body: JSON.stringify({ code: promoCode }) });
      setPromoCode("");
      await loadProfile();
      pushAlert("success", "Промокод активирован.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const createAdminCard = async () => {
    try {
      const formData = new FormData();
      formData.append("name", newCard.name);
      formData.append("rarity", newCard.rarity);
      formData.append("basePrice", String(newCard.basePrice));
      if (newCardImage) formData.append("image", newCardImage);

      await fetch(`${API}/admin/cards/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create card failed");
        return data;
      });

      setNewCard({ name: "", rarity: "standard", basePrice: 100 });
      setNewCardImage(null);
      await loadAdminData();
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const deleteAdminCard = async (id) => {
    try {
      await request(`/admin/cards/${id}`, token, { method: "DELETE" });
      await loadAdminData();
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const updateAdminCardImage = async (cardId) => {
    try {
      const file = cardImageEdits[cardId];
      if (!file) return pushAlert("error", "Сначала выбери файл для карточки.");
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API}/admin/cards/${cardId}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setCardImageEdits((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      await loadAdminData();
      pushAlert("success", "Фото карточки обновлено.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const createAdminPromo = async () => {
    try {
      await request("/admin/promocodes", token, { method: "POST", body: JSON.stringify({ code: newPromo.code, amount: Number(newPromo.amount) }) });
      setNewPromo({ code: "", amount: 100 });
      await loadAdminData();
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const togglePromo = async (promo) => {
    try {
      await request(`/admin/promocodes/${promo.id}`, token, { method: "PATCH", body: JSON.stringify({ isActive: !promo.isActive }) });
      await loadAdminData();
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const saveCasePrice = async () => {
    try {
      await request("/admin/config", token, { method: "PATCH", body: JSON.stringify({ caseOpenPrice: Number(caseOpenPrice) }) });
      await loadCaseState();
      pushAlert("success", "Цена открытия кейса обновлена.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  const saveGameCircleImage = async () => {
    try {
      if (!gameCircleImageFile) return pushAlert("error", "Выбери изображение круга.");
      const formData = new FormData();
      formData.append("image", gameCircleImageFile);
      const res = await fetch(`${API}/admin/game-circle/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setGameCircleImageFile(null);
      setGameCircleImageUrl(data.gameCircleImageUrl || "");
      pushAlert("success", "Фон круга обновлён.");
    } catch (e) {
      pushAlert("error", e.message);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadProfile(token);
    loadListings(token);
    loadCaseState(token);
    loadCaseCards(token);
    loadGameConfig(token);
  }, [token]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const handleMediaChange = (event) => setIsMobileViewport(event.matches);
    setIsMobileViewport(media.matches);
    media.addEventListener("change", handleMediaChange);
    return () => media.removeEventListener("change", handleMediaChange);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMobileMenuOpen(false);
      setShowMobileChatDialog(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    if (tab !== "Чат") setShowMobileChatDialog(false);
  }, [tab]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    feedSyncRef.current = {
      posts: feedPosts,
      hasMore: feedHasMore,
      loadingMore: feedLoadingMore,
      mediaOnly: feedMediaOnly,
    };
  }, [feedPosts, feedHasMore, feedLoadingMore, feedMediaOnly]);

  useEffect(() => {
    if (!token || tab !== "Лента") return;
    let cancelled = false;
    (async () => {
      setFeedLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("take", "15");
        if (feedMediaOnly) qs.set("mediaOnly", "1");
        const data = await request(`/feed?${qs}`, token);
        if (cancelled) return;
        setFeedPosts(data.items);
        setFeedHasMore(Boolean(data.nextCursor));
      } catch (e) {
        if (!cancelled) pushAlert("error", e.message);
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tab, feedMediaOnly]);

  // Socket.IO
  useEffect(() => {
    if (!token) return;
    const socket = ioClient(API_BASE, { auth: { token } });
    socketRef.current = socket;

    socket.on("chat:new_message", ({ chatId, message }) => {
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.id === chatId);
        if (idx === -1) return prev;
        const next = [...prev];
        const isActive = Number(chatId) === Number(activeChatId);
        const inc = isActive ? 0 : 1;
        const updated = {
          ...next[idx],
          lastMessage: { id: message.id, text: message.text, createdAt: message.createdAt, sender: message.sender },
          updatedAt: new Date().toISOString(),
          unreadCount: (next[idx].unreadCount || 0) + inc,
        };
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
      if (Number(chatId) === Number(activeChatId)) {
        setChatMessages((prev) => [...prev, message]);
        request(`/chats/${chatId}/read`, token, { method: "POST", body: JSON.stringify({ lastReadMessageId: message.id }) }).catch(() => {});
        requestAnimationFrame(() => {
          const el = chatScrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } else {
        pushAlert("success", "Новое сообщение");
      }
    });

    socket.on("chat:typing", ({ chatId, userId, isTyping }) => {
      if (Number(chatId) !== Number(activeChatId)) return;
      if (Number(userId) === Number(user?.id)) return;
      setChatTyping(Boolean(isTyping));
    });

    socket.on("feed:new_post", ({ post }) => {
      setFeedPosts((prev) => {
        if (prev.some((p) => p.id === post.id)) return prev;
        return [post, ...prev];
      });
    });
    socket.on("feed:reaction", ({ postId, likeCount, poopCount }) => {
      setFeedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likeCount, poopCount } : p)));
    });
    socket.on("feed:post_updated", ({ post }) => {
      setFeedPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    });
    socket.on("feed:post_deleted", ({ postId }) => {
      setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, API_BASE]);

  // Join/leave chat room
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!activeChatId) return;
    socket.emit("chat:join", { chatId: activeChatId });
    return () => socket.emit("chat:leave", { chatId: activeChatId });
  }, [activeChatId]);

  useEffect(() => {
    if (!token) return;
    if (tab !== "Чат") return;
    loadChats();
  }, [token, tab, chatQuery]);

  useEffect(() => {
    if (!token) return;
    if (tab !== "Чат") return;
    loadChatUsers();
  }, [token, tab, chatUsersQuery]);

  useEffect(() => {
    if (!token) return;
    if (tab !== "Чат") return;
    if (!activeChatId) return;
    setChatNextCursor(null);
    setChatHasMore(true);
    loadChatMessages(activeChatId, null);
  }, [token, tab, activeChatId]);

  useEffect(() => {
    if (!token) return;
    const POLL_MS = 30000;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      loadProfile(token);
      loadCaseState(token);
    };
    const interval = window.setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (user?.isAdmin) loadAdminData();
  }, [user?.isAdmin]);

  useEffect(() => () => stopRewardEffects(), []);

  const toast = (
    <div className="toastRoot">
      {alerts.map((item) => (
        <div key={item.id} className={`alert ${item.type}`}>
          <span>{item.message}</span>
          <button onClick={() => setAlerts((prev) => prev.filter((a) => a.id !== item.id))}>x</button>
        </div>
      ))}
    </div>
  );

  if (!token) {
    return (
      <main className="app auth">
        <video className="authVideoBg" autoPlay muted loop playsInline>
          <source src="/honeypie[enhanced].mp4" type="video/mp4" />
        </video>
        <div className="authVideoOverlay" aria-hidden="true" />
        {toast}
        <GlitchText speed={2.5} enableShadows={true} enableOnHover={false} className="authTitleGlitch">
          VladDrop
        </GlitchText>
        <form className="card authCard" onSubmit={handleAuth}>
          <h2>{authMode === "login" ? "Авторизация" : "Регистрация"}</h2>
          <input placeholder="login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <input placeholder="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {authMode === "register" && <input placeholder="confirm password" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />}
          <button type="submit">{authMode === "login" ? "Войти" : "Зарегистрироваться"}</button>
          <button type="button" className="ghost" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            {authMode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}
          </button>
        </form>
      </main>
    );
  }

  if (user?.isAdmin) {
    return (
      <main className="app appWithFx">
        <div className="appFxBg" aria-hidden="true">
          <FloatingLines
            enabledWaves={floatingEnabledWaves}
            lineCount={8}
            lineDistance={8}
            bendRadius={8}
            bendStrength={-2}
            interactive={false}
            parallax={false}
            linesGradient={floatingGradient}
            animationSpeed={1}
            mixBlendMode="screen"
          />
        </div>
        {toast}
        <header className="topBar">
          <h1>Admin Panel</h1>
          <div className="row">
            <button className="logoutBtn" onClick={handleLogout}>Выйти</button>
          </div>
        </header>
        <section className="card">
          <h3>Пользователи</h3>
          {adminUsers.map((u) => (
            <p key={u.id}>{u.login} | balance: {u.balance} | {u.isAdmin ? "admin" : "user"}</p>
          ))}
        </section>
        <section className="card">
          <h3>Карточки</h3>
          <div className="row">
            <input placeholder="Название" value={newCard.name} onChange={(e) => setNewCard({ ...newCard, name: e.target.value })} />
            <select value={newCard.rarity} onChange={(e) => setNewCard({ ...newCard, rarity: e.target.value })}>
              <option value="standard">standard</option>
              <option value="legendary">legendary</option>
              <option value="diamond">diamond</option>
            </select>
            <input type="number" placeholder="Цена" value={newCard.basePrice} onChange={(e) => setNewCard({ ...newCard, basePrice: e.target.value })} />
            <input type="file" accept="image/*" onChange={(e) => setNewCardImage(e.target.files?.[0] || null)} />
            <button onClick={createAdminCard}>Добавить</button>
          </div>
          {adminCards.map((card) => (
            <div key={card.id} className="listing">
              <span>
                <img className={`cardThumb rarity-${card.rarity}`} src={toAssetUrl(card.imageUrl)} alt={card.name} />
                {card.name} ({card.rarity}) {card.basePrice}
              </span>
              <div className="row">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setCardImageEdits((prev) => ({ ...prev, [card.id]: e.target.files?.[0] || null }))
                  }
                />
                <button className="ghost" onClick={() => updateAdminCardImage(card.id)}>
                  Обновить фото
                </button>
                <button onClick={() => deleteAdminCard(card.id)}>Удалить</button>
              </div>
            </div>
          ))}
        </section>
        <section className="card">
          <h3>Промокоды</h3>
          <div className="row">
            <input placeholder="CODE" value={newPromo.code} onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })} />
            <input type="number" placeholder="Сумма" value={newPromo.amount} onChange={(e) => setNewPromo({ ...newPromo, amount: e.target.value })} />
            <button onClick={createAdminPromo}>Создать</button>
          </div>
          {adminPromos.map((promo) => (
            <div key={promo.id} className="listing">
              <span>{promo.code} | {promo.amount} | {promo.isActive ? "active" : "disabled"}</span>
              <button onClick={() => togglePromo(promo)}>{promo.isActive ? "Деактивировать" : "Активировать"}</button>
            </div>
          ))}
        </section>
        <section className="card">
          <h3>Настройки кейса</h3>
          <div className="row">
            <input type="number" min="1" value={caseOpenPrice} onChange={(e) => setCaseOpenPrice(e.target.value)} />
            <button onClick={saveCasePrice}>Сохранить цену открытия</button>
          </div>
        </section>
        <section className="card">
          <h3>Фон круга мини-игры</h3>
          <div className="row">
            <input type="file" accept="image/*" onChange={(e) => setGameCircleImageFile(e.target.files?.[0] || null)} />
            <button onClick={saveGameCircleImage}>Загрузить фон</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app appWithFx">
      <div className="appFxBg" aria-hidden="true">
        {tab === "Мини-игра" ? (
          <video className="miniGameVideoBg" autoPlay muted loop playsInline>
            <source src="/video.mp4" type="video/mp4" />
          </video>
        ) : (
          <FloatingLines
            enabledWaves={floatingEnabledWaves}
            lineCount={8}
            lineDistance={8}
            bendRadius={8}
            bendStrength={-2}
            interactive={false}
            parallax={false}
            linesGradient={floatingGradient}
            animationSpeed={1}
            mixBlendMode="screen"
          />
        )}
      </div>
      <audio ref={audioRef} src="/matadora.mp3" preload="auto" />
      {emojiRain.length > 0 && (
        <div className="emojiRainLayer" aria-hidden="true">
          {emojiRain.map((item) => (
            <span
              key={item.id}
              className="emojiDrop"
              style={{
                left: `${item.left}%`,
                animationDuration: `${item.duration}s`,
                animationDelay: `${item.delay}s`,
                fontSize: `${item.size}px`,
              }}
            >
              {item.emoji}
            </span>
          ))}
        </div>
      )}
      {dancingCard && (
        <div className="danceOverlay" aria-hidden="true">
          <ElectricBorder color="#7df9ff" speed={1} chaos={0.12} borderRadius={16} style={{ borderRadius: 16 }}>
            <div className="danceCard rarity-diamond">
              <img src={toAssetUrl(dancingCard.imageUrl)} alt={dancingCard.name} />
              <strong>{dancingCard.name}</strong>
            </div>
          </ElectricBorder>
        </div>
      )}
      {toast}
      <header className="tabsHeader">
        <div className="mobileTopBar">
          <button
            type="button"
            className={`burgerBtn ${isMobileMenuOpen ? "active" : ""}`}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isMobileMenuOpen}
          >
            <span />
            <span />
            <span />
          </button>
          <strong className="mobileCurrentTab">{tab}</strong>
          <span className="mobileBalance">{user?.balance ?? 0}</span>
        </div>
        <div className="topBar">
          <h1>VladDrop</h1>
          <div>
            <span className="balance">Баланс: {user?.balance ?? 0}</span>
            <button className="logoutBtn" onClick={handleLogout}>Выйти</button>
          </div>
        </div>
        <div className="tabsGlass tabsGlassLite">
          <GooeyNav
            items={navItems}
            initialActiveIndex={activeTabIndex < 0 ? 0 : activeTabIndex}
            activeIndex={activeTabIndex < 0 ? 0 : activeTabIndex}
            onChange={(index) => setTab(tabs[index])}
            particleCount={15}
            particleDistances={[90, 10]}
            particleR={100}
            animationTime={600}
            timeVariance={300}
            colors={[1, 2, 3, 1, 2, 3, 1, 4]}
          />
        </div>
      </header>
      {isMobileViewport && (
        <>
          <div className={`mobileMenuOverlay ${isMobileMenuOpen ? "show" : ""}`} onClick={() => setIsMobileMenuOpen(false)} />
          <aside className={`mobileMenuPanel ${isMobileMenuOpen ? "open" : ""}`}>
            <nav className="mobileMenuNav">
              {tabs.map((item) => (
                <button
                  key={item}
                  className={item === tab ? "active" : ""}
                  onClick={() => {
                    setTab(item);
                    if (item !== "Чат") setShowMobileChatDialog(false);
                  }}
                >
                  {item}
                </button>
              ))}
            </nav>
          </aside>
        </>
      )}

      {tab === "Кейс" && (
        <section className="card tabContent">
          <p>Цена платного открытия: {caseState.paidPrice}</p>
          <div className="row">
            <button disabled={isOpeningCase || !caseState.canOpenFree} onClick={() => handleCaseOpen("free")}>
              {caseState.canOpenFree
                ? `Открыть бесплатно${caseState.freeOpensLeft > 0 ? ` (${caseState.freeOpensLeft} осталось)` : ""}`
                : `Ждать ${Math.max(0, caseState.freeOpenCooldownSeconds)}с`}
            </button>
            <button disabled={isOpeningCase} onClick={() => handleCaseOpen("paid")}>
              Открыть платно за {caseState.paidPrice}
            </button>
          </div>
          <div className="rouletteWrap">
            <div className="centerPointer" />
            <div className="reel" ref={reelViewportRef}>
              <div
                ref={reelTrackRef}
                className={`reelTrack ${isRouletteSpinning ? "spinning" : ""}`}
                style={{
                  transform: `translate3d(-${rouletteOffset}px,0,0)`,
                  transition: isRouletteSpinning ? "transform 5s cubic-bezier(0.08,0.72,0.14,1)" : "none",
                }}
              >
                {rouletteCards.map((card, idx) => (
                  <div
                    key={`${card.id}-${idx}`}
                    className={`rouletteCard rarity-${card.rarity} ${!isRouletteSpinning && idx === winningRouletteIndex ? "winner" : ""}`}
                  >
                    <img src={toAssetUrl(card.imageUrl)} alt={card.name} />
                    <small>{card.name}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className={rewardCard.includes("legendary") ? "rarityLegendary" : rewardCard.includes("diamond") ? "rarityDiamond" : ""}>Выигрыш: {rewardCard || "ещё нет"}</p>
        </section>
      )}

      {tab === "Биржа" && (
        <section className="card tabContent">
          <h3>Внутриигровая торговая площадка</h3>
          <div className="row">
            <select value={listingCardId} onChange={(e) => setListingCardId(e.target.value)}>
              <option value="">Карточка из инвентаря</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.card.id}>{item.card.name} ({item.card.basePrice})</option>
              ))}
            </select>
            <input type="number" min="1" value={listingPrice} onChange={(e) => setListingPrice(e.target.value)} placeholder="Цена продажи" />
            <button onClick={handleCreateListing}>Выставить</button>
          </div>
          <button className="ghost" onClick={() => loadListings()}>Обновить биржу</button>
          {marketListings.map((listing) => (
            <div key={listing.id} className="listing">
              <span>
                <img className={`cardThumb rarity-${listing.card.rarity}`} src={toAssetUrl(listing.card.imageUrl)} alt={listing.card.name} />
                {listing.card.name} | {listing.seller.login} | {listing.price}
              </span>
              {listing.sellerId === user?.id ? (
                <button className="ghost" onClick={() => handleUnlist(listing.id)}>Снять с продажи</button>
              ) : (
                <button onClick={() => handleBuyListing(listing.id)}>Купить</button>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === "Мини-игра" && (
        <section className="card centered tabContent miniGameCard">
          <button
            className="tapCircle big"
            onClick={handleTap}
            style={
              gameCircleImageUrl
                ? { backgroundImage: `url(${toAssetUrl(gameCircleImageUrl)})`, backgroundSize: "cover", backgroundPosition: "center" }
                : undefined
            }
          >
            TAP
          </button>
          <p>Каждый клик приносит +1 к балансу.</p>
        </section>
      )}

      {tab === "Лидерборд" && (
        <section className="card tabContent">
          <button onClick={loadLeaderboard}>Обновить таблицу</button>
          {leaderboard.map((item, idx) => (
            <div key={item.id} className="listing">
              <span>
                <img className="avatarCircle" src={toAssetUrl(item.avatarUrl)} alt={item.login} />
                {idx + 1}. {item.login} - {item.balance}
              </span>
            </div>
          ))}
        </section>
      )}

      {tab === "Лента" && (
        <section className="feedLayout">
          <div className="feedColumn">
            <div className="feedComposer card">
              <h3 className="feedComposerTitle">Новый пост</h3>
              {feedStaging.length > 0 && (
                <div className="feedPreviewRow">
                  {feedStaging.map((s) => (
                    <div key={s.id} className="feedPreviewItem">
                      {s.file.type.startsWith("image/") ? (
                        <img src={s.url} alt="" className="feedPreviewImg" />
                      ) : s.file.type.startsWith("video/") ? (
                        <video src={s.url} className="feedPreviewVid" muted playsInline />
                      ) : (
                        <div className="feedPreviewFile">{s.file.name}</div>
                      )}
                      <button type="button" className="feedPreviewRemove" onClick={() => removeFeedStagingItem(s.id)} aria-label="Убрать вложение">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                className="feedTextarea"
                placeholder="Текст поста (можно оставить пустым, если есть медиа)"
                value={feedText}
                onChange={(e) => setFeedText(e.target.value)}
                rows={3}
              />
              <div className="feedComposerActions">
                <input
                  id="feedFileInput"
                  type="file"
                  className="chatFileInputHidden"
                  multiple
                  accept="image/jpeg,image/png,video/mp4,application/*"
                  onChange={(e) => {
                    addFeedFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <label className="feedAttachLabel" htmlFor="feedFileInput">
                  Прикрепить файлы
                </label>
                <button type="button" disabled={feedPublishing} onClick={publishFeedPost}>
                  {feedPublishing ? "Публикация…" : "Опубликовать"}
                </button>
              </div>
            </div>

            <div className="feedFilterBar card">
              <label className="feedFilterLabel">
                <input type="checkbox" checked={feedMediaOnly} onChange={(e) => setFeedMediaOnly(e.target.checked)} />
                Только посты с медиа
              </label>
            </div>

            <div
              className="feedStream"
              ref={feedScrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) loadMoreFeed();
              }}
            >
              {feedLoading && feedPosts.length === 0 && <p className="feedHint">Загрузка…</p>}
              {!feedLoading && feedPosts.length === 0 && <p className="feedHint">Пока пусто — будь первым.</p>}
              {feedPosts.map((post) => {
                const isAuthor = post.author?.id === user?.id;
                return (
                  <article key={post.id} className="feedPost card">
                    <div className="feedPostHeader">
                      <img className="avatarCircle" src={toAssetUrl(post.author?.avatarUrl)} alt="" />
                      <div className="feedPostMeta">
                        <div className="feedPostAuthor">{post.author?.login}</div>
                        <time className="feedPostTime" dateTime={post.createdAt}>
                          {formatFeedDate(post.createdAt)}
                        </time>
                      </div>
                      {isAuthor && (
                        <div className="feedPostAuthorActions">
                          {feedEditing === post.id ? (
                            <>
                              <button type="button" className="ghost" onClick={() => setFeedEditing(null)}>
                                Отмена
                              </button>
                              <button type="button" onClick={saveFeedEdit}>
                                Сохранить
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  setFeedEditing(post.id);
                                  setFeedEditText(post.text || "");
                                }}
                              >
                                Правка
                              </button>
                              <button type="button" className="ghost feedDeleteBtn" onClick={() => deleteFeedPost(post.id)}>
                                Удалить
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {feedEditing === post.id ? (
                      <textarea className="feedTextarea" value={feedEditText} onChange={(e) => setFeedEditText(e.target.value)} rows={3} />
                    ) : (
                      post.text && <div className="feedPostBody">{post.text}</div>
                    )}
                    {Array.isArray(post.media) && post.media.length > 0 && (
                      <div className="feedPostMedia">
                        {post.media.map((m) =>
                          m.mimeType?.startsWith("image/") ? (
                            <a key={m.id} href={toAssetUrl(m.url)} target="_blank" rel="noreferrer">
                              <img src={toAssetUrl(m.url)} alt={m.filename} className="feedPostImg" />
                            </a>
                          ) : m.mimeType?.startsWith("video/") ? (
                            <video key={m.id} src={toAssetUrl(m.url)} className="feedPostVideo" controls playsInline />
                          ) : (
                            <a key={m.id} className="chatFileCard" href={toAssetUrl(m.url)} target="_blank" rel="noreferrer">
                              <div className="chatFileName">{m.filename}</div>
                              <div className="chatFileMeta">{Math.round((m.sizeBytes || 0) / 1024)} KB</div>
                            </a>
                          )
                        )}
                      </div>
                    )}
                    <div className="feedPostFooter">
                      <span className="feedCommentStub">💬 {post.commentCount ?? 0}</span>
                      <div className="feedReactions">
                        <button
                          type="button"
                          className={`feedReactionBtn ${post.myReaction === "like" ? "active like" : ""}`}
                          onClick={() => toggleFeedReaction(post, "like")}
                        >
                          👍 <span>{post.likeCount ?? 0}</span>
                        </button>
                        <button
                          type="button"
                          className={`feedReactionBtn ${post.myReaction === "poop" ? "active poop" : ""}`}
                          onClick={() => toggleFeedReaction(post, "poop")}
                        >
                          💩 <span>{post.poopCount ?? 0}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {feedLoadingMore && <p className="feedHint feedHintMore">Подгружаем…</p>}
            </div>
          </div>
        </section>
      )}

      {tab === "Чат" && (
        <section className="chatLayout">
          <aside className="chatList" ref={chatListRef}>
            <div className="chatListHeader">
              <input
                className="chatSearch"
                placeholder="Поиск по чатам..."
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
              />
              <button className="iconBtn" type="button" onClick={loadChats} title="Обновить">
                <Icon name="refresh" />
              </button>
            </div>
            <div className="chatListItems">
              {chats.map((c) => (
                <button
                  key={c.id}
                  className={`chatItem ${c.id === activeChatId ? "active" : ""}`}
                  onClick={() => {
                    setActiveChatId(c.id);
                    if (isMobileViewport) setShowMobileChatDialog(true);
                  }}
                >
                  <img className="avatarCircle" src={toAssetUrl(c.peer?.avatarUrl)} alt={c.peer?.login || "user"} />
                  <div className="chatItemMain">
                    <div className="chatItemTop">
                      <strong>{c.peer?.login || "Диалог"}</strong>
                      <div className="chatItemRight">
                        {c.unreadCount > 0 && <span className="chatUnreadBadge">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                        <span className="chatItemTime">{c.lastMessage?.createdAt ? formatTime(c.lastMessage.createdAt) : ""}</span>
                      </div>
                    </div>
                    <div className="chatItemBottom">
                      <span className="chatItemPreview">{c.lastMessage?.text || ""}</span>
                    </div>
                  </div>
                </button>
              ))}
              {chats.length === 0 && <div className="chatEmpty">Нет чатов</div>}
            </div>

            <div className="chatUsersHeader">
              <strong>Пользователи</strong>
              <button className="iconBtn" type="button" onClick={loadChatUsers} title="Обновить пользователей">
                <Icon name="refresh" />
              </button>
            </div>
            <div className="chatUsersSearchWrap">
              <input
                className="chatSearch"
                placeholder="Поиск пользователей..."
                value={chatUsersQuery}
                onChange={(e) => setChatUsersQuery(e.target.value)}
              />
            </div>
            <div className="chatUsersList">
              {chatUsers.map((u) => (
                <button
                  key={u.id}
                  className="chatUserItem"
                  onClick={() => {
                    ensureChatWithUser(u.id);
                    if (isMobileViewport) setShowMobileChatDialog(true);
                  }}
                >
                  <img className="avatarCircle" src={toAssetUrl(u.avatarUrl)} alt={u.login} />
                  <span>{u.login}</span>
                </button>
              ))}
              {chatUsers.length === 0 && <div className="chatEmpty">Нет пользователей</div>}
            </div>
          </aside>

          <div className={`chatDialog ${showMobileChatDialog ? "mobileOpen" : ""}`}>
            <div className="chatDialogHeader">
              {isMobileViewport && (
                <button type="button" className="chatBackBtn" onClick={() => setShowMobileChatDialog(false)}>
                  ← Назад
                </button>
              )}
              <strong>{chats.find((c) => c.id === activeChatId)?.peer?.login || "Выберите чат"}</strong>
              {chatTyping && <span className="chatTyping">печатает…</span>}
            </div>

            <div
              className="chatMessages"
              ref={chatScrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop < 60 && chatHasMore && chatNextCursor && activeChatId) {
                  loadChatMessages(activeChatId, chatNextCursor);
                }
              }}
            >
              {chatMessages.map((m) => {
                const isMine = m.senderId === user?.id || m.sender?.id === user?.id;
                return (
                  <div key={m.id} className={`chatMsgRow ${isMine ? "mine" : "theirs"}`}>
                    <div className="chatMsgBubble">
                      {m.text && <div className="chatMsgText">{m.text}</div>}
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div className="chatAttachments">
                          {m.attachments.map((a) => {
                            const isImage = a.mimeType?.startsWith("image/");
                            return isImage ? (
                              <a key={a.id} className="chatImgLink" href={toAssetUrl(a.url)} target="_blank" rel="noreferrer">
                                <img className="chatImg" src={toAssetUrl(a.url)} alt={a.filename} />
                              </a>
                            ) : (
                              <a key={a.id} className="chatFileCard" href={toAssetUrl(a.url)} target="_blank" rel="noreferrer">
                                <div className="chatFileName">{a.filename}</div>
                                <div className="chatFileMeta">{Math.round((a.sizeBytes || 0) / 1024)} KB</div>
                              </a>
                            );
                          })}
                        </div>
                      )}
                      <div className="chatMsgMeta">{formatTime(m.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="chatComposer">
              {chatAttachments.length > 0 && (
                <div className="chatPending">
                  {chatAttachments.map((f) => (
                    <span key={`${f.name}-${f.size}`} className="chatPendingItem">
                      {f.name} ({Math.round(f.size / 1024)} KB)
                    </span>
                  ))}
                  <button className="ghost" onClick={() => setChatAttachments([])}>Очистить</button>
                </div>
              )}
              <div className="chatComposerRow">
                <input
                  id="chatFileInput"
                  className="chatFileInputHidden"
                  type="file"
                  multiple
                  onChange={(e) => setChatAttachments(Array.from(e.target.files || []))}
                />
                <label className="iconBtn" htmlFor="chatFileInput" title="Прикрепить файл">
                  <Icon name="paperclip" />
                </label>
                <textarea
                  className="chatInput"
                  placeholder="Сообщение..."
                  value={chatText}
                  onChange={(e) => {
                    setChatText(e.target.value);
                    const socket = socketRef.current;
                    if (socket && activeChatId) socket.emit("chat:typing", { chatId: activeChatId, isTyping: true });
                  }}
                  onBlur={() => {
                    const socket = socketRef.current;
                    if (socket && activeChatId) socket.emit("chat:typing", { chatId: activeChatId, isTyping: false });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                      const socket = socketRef.current;
                      if (socket && activeChatId) socket.emit("chat:typing", { chatId: activeChatId, isTyping: false });
                    }
                  }}
                  rows={2}
                />
                <button className="iconBtn primary" disabled={chatUploading} onClick={sendChatMessage} title="Отправить">
                  {chatUploading ? "..." : <Icon name="send" />}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "Личный кабинет" && (
        <section className="card tabContent">
          <h3>Профиль</h3>
          <button className="logoutBtn" onClick={handleLogout}>Выйти из аккаунта</button>
          <p>Логин: {user.login}</p>
          <img className="avatarCircle large" src={toAssetUrl(user.avatarUrl)} alt={user.login} />
          <div className="row">
            <input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} />
            <button onClick={handleChangeAvatar}>Сменить аватар</button>
          </div>
          <div className="row">
            <input type="password" placeholder="Старый пароль" value={passwords.oldPassword} onChange={(e) => setPasswords({ ...passwords, oldPassword: e.target.value })} />
            <input type="password" placeholder="Новый пароль" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
            <button onClick={handleChangePassword}>Сменить пароль</button>
          </div>
          <div className="row">
            <input placeholder="Промокод" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} />
            <button onClick={handlePromoActivate}>Активировать</button>
          </div>
          <h3>Инвентарь</h3>
          {inventory.map((item) => (
            <div key={item.id} className="listing">
              <span>
                <img className={`cardThumb rarity-${item.card.rarity}`} src={toAssetUrl(item.card.imageUrl)} alt={item.card.name} />
                {item.card.name} | базовая цена: {item.card.basePrice}
              </span>
              <button onClick={() => handleSellFromCabinet(item.id)}>Продать за {item.card.basePrice}</button>
            </div>
          ))}
        </section>
      )}

      {tapHearts.map((heart) => (
        <span key={heart.id} className="tapHeart" style={{ left: `${heart.x}px`, top: `${heart.y}px` }}>
          💖
        </span>
      ))}
    </main>
  );
}

export default App;
