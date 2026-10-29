import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Search,
  Send,
  Paperclip,
  Users,
  EllipsisVertical,
  LogOut,
  Reply,
  Pencil,
  Trash2,
  X,
  MessageSquare,
  FileText,
  Link2,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Smile,
  Pin,
  Rocket,
  CheckCircle2,
  Lightbulb,
  Sparkles,
  Trophy,
  Hash,
  Check,
  UserRound,
} from "lucide-react";
import { api, uploadFiles } from "../lib/api.js";
import { SelectedFiles, useSelectedFiles } from "../components/SelectedFiles.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import PageHeader from "../components/PageHeader.jsx";
import "./messages-theme.css";
import {
  Modal,
  Field,
  ErrorBox,
  Empty,
  Loading,
  Avatar,
  Attachments,
} from "../components/UI.jsx";
const displayName = (c, me) =>
  c?.type === "DIRECT"
    ? c.members.find((m) => m.userId !== me)?.user.displayName ||
      "Direct message"
    : c?.name;

const LAST_CHAT_KEY = "collab:last-selected-chat";
const CONVERSATION_FILTERS = [
  { id: "all", label: "All" },
  { id: "direct", label: "Direct" },
  { id: "unread", label: "Unread" },
  { id: "channels", label: "Channels" },
];
function chatDateKey(value) { return new Date(value).toDateString(); }
function chatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (chatDateKey(date) === chatDateKey(now)) return "Today";
  if (chatDateKey(date) === chatDateKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
function chatListTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = chatDayLabel(date);
  if (day === "Today") return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (day === "Yesterday") return day;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const CHAT_SEARCH_TABS = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "files", label: "Files", icon: FileText },
  { id: "links", label: "Links", icon: Link2 },
];

const emojiList = (value) => value.trim().split(/\s+/);

const EMOJI_GROUPS = [
  {
    id: "faces",
    label: "Faces & emotion",
    icon: "😀",
    emojis: emojiList(`
😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠 🤥 😶 😶‍🌫️ 😐 😑 😬 🫨 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾
`),
  },
  {
    id: "hands",
    label: "Hands & people",
    icon: "👋",
    emojis: emojiList(`
👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 🫷 🫸 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦 💋 👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 👷 💂 🕵️ 👩‍⚕️ 👨‍⚕️ 👩‍🌾 👨‍🌾 👩‍🍳 👨‍🍳 👩‍🎓 👨‍🎓 👩‍🎤 👨‍🎤 👩‍🏫 👨‍🏫 👩‍🏭 👨‍🏭 👩‍💻 👨‍💻 👩‍💼 👨‍💼 👩‍🔧 👨‍🔧 👩‍🔬 👨‍🔬 👩‍🎨 👨‍🎨 👩‍🚒 👨‍🚒 👩‍✈️ 👨‍✈️ 👩‍🚀 👨‍🚀 👩‍⚖️ 👨‍⚖️
`),
  },
  {
    id: "animals",
    label: "Animals & nature",
    icon: "🐻",
    emojis: emojiList(`
🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪲 🐛 🦋 🐌 🐞 🐜 🪰 🪱 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🦭 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐕‍🦺 🐈 🐈‍⬛ 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🪹 🪺 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🍄 🐚 🪸 💐 🌷 🌹 🥀 🪻 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 💨 💧 💦 🫧 ☔
`),
  },
  {
    id: "food",
    label: "Food & drink",
    icon: "🍕",
    emojis: emojiList(`
🍏 🍎 🍐 🍊 🍋 🍋‍🟩 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🫛 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🫚 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🦴 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🫘 🍯 🥛 🍼 🫖 ☕ 🍵 🧃 🥤 🧋 🧉 🥂 🍷 🍸 🍹 🍺 🍻 🥃 🫗 🥄 🍴 🍽️ 🥣 🥡 🥢 🧂
`),
  },
  {
    id: "activities",
    label: "Sports & activities",
    icon: "⚽",
    emojis: emojiList(`
⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩
`),
  },
  {
    id: "travel",
    label: "Travel & places",
    icon: "🚗",
    emojis: emojiList(`
🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🛹 🛼 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🛟 ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🛖 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🛕 🕍 ⛩️ 🕋 🌁 🌃 🏙️ 🌄 🌅 🌆 🌇 🌉 ♨️ 🎑
`),
  },
  {
    id: "objects",
    label: "Objects",
    icon: "💡",
    emojis: emojiList(`
⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 🕹️ 🗜️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🪫 🔌 💡 🔦 🕯️ 🪔 🧯 🛢️ 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🪛 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 🧱 ⛓️ ⛓️‍💥 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 🪬 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 🩻 🩼 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🪠 🧺 🧻 🚽 🚿 🛁 🪥 🪒 🧴 🧷 🧹 🧽 🪣 🧼 🫧 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🪞 🪟 🛍️ 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🪩 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 🪧 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓
`),
  },
  {
    id: "symbols",
    label: "Hearts & symbols",
    icon: "❤️",
    emojis: emojiList(`
❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🛗 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 ⚧️ 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ⏏️ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ 🔀 🔁 🔂 ◀️ 🔼 🔽 ⏫ ⏬ ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ 🔄 ↪️ ↩️ ⤴️ ⤵️ #️⃣ *️⃣ ℹ️
`),
  },
  {
    id: "flags",
    label: "Flags",
    icon: "🏳️",
    emojis: emojiList(`
🏁 🚩 🎌 🏴 🏳️ 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇦🇫 🇦🇱 🇩🇿 🇦🇸 🇦🇩 🇦🇴 🇦🇮 🇦🇶 🇦🇬 🇦🇷 🇦🇲 🇦🇼 🇦🇺 🇦🇹 🇦🇿 🇧🇸 🇧🇭 🇧🇩 🇧🇧 🇧🇾 🇧🇪 🇧🇿 🇧🇯 🇧🇲 🇧🇹 🇧🇴 🇧🇦 🇧🇼 🇧🇷 🇧🇳 🇧🇬 🇧🇫 🇧🇮 🇰🇭 🇨🇲 🇨🇦 🇨🇻 🇨🇫 🇹🇩 🇨🇱 🇨🇳 🇨🇴 🇰🇲 🇨🇬 🇨🇩 🇨🇷 🇨🇮 🇭🇷 🇨🇺 🇨🇾 🇨🇿 🇩🇰 🇩🇯 🇩🇲 🇩🇴 🇪🇨 🇪🇬 🇸🇻 🇬🇶 🇪🇷 🇪🇪 🇸🇿 🇪🇹 🇫🇯 🇫🇮 🇫🇷 🇬🇦 🇬🇲 🇬🇪 🇩🇪 🇬🇭 🇬🇷 🇬🇩 🇬🇹 🇬🇳 🇬🇼 🇬🇾 🇭🇹 🇭🇳 🇭🇰 🇭🇺 🇮🇸 🇮🇳 🇮🇩 🇮🇷 🇮🇶 🇮🇪 🇮🇱 🇮🇹 🇯🇲 🇯🇵 🇯🇴 🇰🇿 🇰🇪 🇰🇮 🇽🇰 🇰🇼 🇰🇬 🇱🇦 🇱🇻 🇱🇧 🇱🇸 🇱🇷 🇱🇾 🇱🇮 🇱🇹 🇱🇺 🇲🇬 🇲🇼 🇲🇾 🇲🇻 🇲🇱 🇲🇹 🇲🇭 🇲🇷 🇲🇺 🇲🇽 🇫🇲 🇲🇩 🇲🇨 🇲🇳 🇲🇪 🇲🇦 🇲🇿 🇲🇲 🇳🇦 🇳🇷 🇳🇵 🇳🇱 🇳🇿 🇳🇮 🇳🇪 🇳🇬 🇰🇵 🇲🇰 🇳🇴 🇴🇲 🇵🇰 🇵🇼 🇵🇸 🇵🇦 🇵🇬 🇵🇾 🇵🇪 🇵🇭 🇵🇱 🇵🇹 🇶🇦 🇷🇴 🇷🇺 🇷🇼 🇼🇸 🇸🇲 🇸🇦 🇸🇳 🇷🇸 🇸🇨 🇸🇱 🇸🇬 🇸🇰 🇸🇮 🇸🇧 🇸🇴 🇿🇦 🇰🇷 🇸🇸 🇪🇸 🇱🇰 🇸🇩 🇸🇷 🇸🇪 🇨🇭 🇸🇾 🇹🇼 🇹🇯 🇹🇿 🇹🇭 🇹🇱 🇹🇬 🇹🇴 🇹🇹 🇹🇳 🇹🇷 🇹🇲 🇹🇻 🇺🇬 🇺🇦 🇦🇪 🇬🇧 🇺🇸 🇺🇾 🇺🇿 🇻🇺 🇻🇦 🇻🇪 🇻🇳 🇾🇪 🇿🇲 🇿🇼
`),
  },
];

const CUSTOM_REACTIONS = [
  { value: ":ship-it:", label: "Ship it", Icon: Rocket },
  { value: ":approved:", label: "Approved", Icon: CheckCircle2 },
  { value: ":great-idea:", label: "Great idea", Icon: Lightbulb },
  { value: ":excellent:", label: "Excellent", Icon: Trophy },
  { value: ":magic:", label: "Magic", Icon: Sparkles },
  { value: ":teamwork:", label: "Teamwork", Icon: Users },
];

const customReaction = (value) =>
  CUSTOM_REACTIONS.find((item) => item.value === value);

function ReactionGlyph({ value, size = 18 }) {
  const custom = customReaction(value);
  if (custom) {
    const Icon = custom.Icon;
    return (
      <span
        className="inline-flex items-center justify-center rounded-md bg-slate-900 text-white"
        style={{ width: size + 6, height: size + 6 }}
        title={custom.label}
      >
        <Icon size={size} strokeWidth={2.2} />
      </span>
    );
  }
  return <span className="leading-none">{value}</span>;
}

function reactionLabel(value) {
  return customReaction(value)?.label || value;
}

function groupedReactions(reactions = [], userId) {
  const groups = new Map();
  for (const reaction of reactions) {
    const current = groups.get(reaction.emoji) || {
      emoji: reaction.emoji,
      users: [],
      reactedByMe: false,
    };
    current.users.push(reaction.user);
    if (reaction.userId === userId) current.reactedByMe = true;
    groups.set(reaction.emoji, current);
  }
  return [...groups.values()];
}

function ReactionDetailsMenu({ groups, align = "left" }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(groups[0]?.emoji || null);
  const selectedGroup =
    groups.find((group) => group.emoji === selectedEmoji) || groups[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!groups.length) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold leading-none text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        title="View reactions"
        aria-label="View who reacted"
        aria-expanded={open}
        onClick={() => {
          if (!groups.some((group) => group.emoji === selectedEmoji))
            setSelectedEmoji(groups[0].emoji);
          setOpen((current) => !current);
        }}
      >
        ...
      </button>
      {open && selectedGroup && (
        <div
          className={`absolute bottom-full z-50 mb-2 w-64 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2">
            {groups.map((group) => (
              <button
                key={group.emoji}
                type="button"
                className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs transition ${
                  selectedGroup.emoji === group.emoji
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-transparent text-slate-600 hover:bg-slate-50"
                }`}
                title={reactionLabel(group.emoji)}
                aria-label={`Show users who reacted ${reactionLabel(group.emoji)}`}
                onClick={() => setSelectedEmoji(group.emoji)}
              >
                <ReactionGlyph value={group.emoji} size={13} />
                <span>{group.users.length}</span>
              </button>
            ))}
          </div>
          <div className="max-h-48 overflow-y-auto p-2">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {reactionLabel(selectedGroup.emoji)} · {selectedGroup.users.length}
            </div>
            <div className="space-y-1">
              {selectedGroup.users.map((reactedUser, index) => (
                <div
                  key={reactedUser.id || `${selectedGroup.emoji}-${index}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2"
                >
                  <Avatar small name={reactedUser.displayName} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                    {reactedUser.displayName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmojiMenu({
  onSelect,
  onClose,
  align = "left",
  includeCustom = false,
}) {
  const ref = useRef(null);
  const scrollRef = useRef(null);
  const sectionRefs = useRef(new Map());
  const [activeCategory, setActiveCategory] = useState("faces");
  const groups = includeCustom
    ? [
        {
          id: "custom",
          label: "Custom reactions",
          icon: "✨",
          emojis: CUSTOM_REACTIONS.map((item) => item.value),
        },
        ...EMOJI_GROUPS,
      ]
    : EMOJI_GROUPS;

  useEffect(() => {
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const goToCategory = (id) => {
    setActiveCategory(id);
    const section = sectionRefs.current.get(id);
    const container = scrollRef.current;
    if (!section || !container) return;
    container.scrollTo({
      top: Math.max(0, section.offsetTop - 2),
      behavior: "smooth",
    });
  };

  return (
    <div
      ref={ref}
      className={`absolute bottom-full z-50 mb-2 w-[326px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100 pb-2">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            title={group.label}
            aria-label={group.label}
            className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-base transition ${
              activeCategory === group.id
                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                : "text-slate-500 hover:bg-slate-100"
            }`}
            onClick={() => goToCategory(group.id)}
          >
            {group.id === "custom" ? <Sparkles size={15} /> : group.icon}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="relative mt-2 h-[142px] overflow-y-auto overscroll-contain pr-1"
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop + 12;
          let current = groups[0]?.id;
          for (const group of groups) {
            const section = sectionRefs.current.get(group.id);
            if (section && section.offsetTop <= top) current = group.id;
          }
          if (current) setActiveCategory(current);
        }}
      >
        {groups.map((group) => (
          <section
            key={group.id}
            ref={(node) => {
              if (node) sectionRefs.current.set(group.id, node);
              else sectionRefs.current.delete(group.id);
            }}
            className="mb-2 last:mb-0"
          >
            <div className="sticky top-0 z-10 h-[18px] bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {group.label}
            </div>
            <div className="grid grid-cols-10 gap-px">
              {group.emojis.map((emoji, index) => (
                <button
                  key={`${group.id}-${emoji}-${index}`}
                  type="button"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-transparent text-[20px] leading-none transition hover:border-slate-200 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  onClick={() => onSelect(emoji)}
                  aria-label={`Use ${reactionLabel(emoji)}`}
                  title={reactionLabel(emoji)}
                >
                  <ReactionGlyph value={emoji} size={15} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function chatBadgeLabel(count) {
  if (!count) return null;
  return count > 99 ? "99+" : String(count);
}

function ReadVisibleMessage({
  enabled,
  messageId,
  className,
  onRead,
  children,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    let visible = false;
    let timer = null;
    const clear = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (
        visible &&
        document.visibilityState === "visible" &&
        document.hasFocus()
      )
        timer = window.setTimeout(() => onRead(messageId), 900);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        schedule();
      },
      { threshold: [0.6] },
    );
    observer.observe(ref.current);
    const onVisibility = () => schedule();
    const onBlur = () => clear();
    window.addEventListener("focus", schedule);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      observer.disconnect();
      window.removeEventListener("focus", schedule);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, messageId, onRead]);

  return (
    <div ref={ref} id={`message-${messageId}`} className={className}>
      {children}
    </div>
  );
}

function MessageReceiptStatus({ message, conversation, onOpen }) {
  const receipts = message.receipts || [];
  if (!receipts.length)
    return <span className="text-[10px] text-slate-400">Sent</span>;

  if (conversation.type === "DIRECT") {
    const receipt = receipts[0];
    const label = receipt.readAt
      ? "Read"
      : receipt.deliveredAt
        ? "Delivered"
        : "Sent";
    return <span className="text-[10px] text-slate-400">{label}</span>;
  }

  const delivered = receipts.filter((receipt) => receipt.deliveredAt).length;
  const read = receipts.filter((receipt) => receipt.readAt).length;
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-400">
      <button
        type="button"
        className="hover:text-slate-700 hover:underline"
        onClick={() => onOpen({ message, type: "delivered" })}
      >
        Delivered to {delivered}
      </button>
      <span>·</span>
      <button
        type="button"
        className="hover:text-slate-700 hover:underline"
        onClick={() => onOpen({ message, type: "read" })}
      >
        Read by {read}
      </button>
    </span>
  );
}

function ReceiptDetails({ details, onClose }) {
  const isRead = details.type === "read";
  const receipts = (details.message.receipts || []).filter((receipt) =>
    isRead ? receipt.readAt : receipt.deliveredAt,
  );
  return (
    <Modal
      title={`${isRead ? "Read by" : "Delivered to"} ${receipts.length}`}
      onClose={onClose}
    >
      {receipts.length ? (
        <div className="space-y-3">
          {receipts.map((receipt) => {
            const timestamp = isRead ? receipt.readAt : receipt.deliveredAt;
            return (
              <div key={receipt.userId} className="flex items-center gap-3">
                <Avatar small name={receipt.user.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {receipt.user.displayName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No users yet.</p>
      )}
    </Modal>
  );
}
function NewChat({ onClose, onCreated }) {
  const { user } = useAuth();
  const dialogRef = useRef(null);
  const [group, setGroup] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const colleagues = useMemo(
    () => (users.data || []).filter((person) => person.id !== user.id && person.status === "ACTIVE"),
    [users.data, user.id],
  );
  const filteredColleagues = useMemo(() => {
    const query = memberSearch.trim().toLocaleLowerCase();
    if (!query) return colleagues;
    return colleagues.filter((person) =>
      [person.displayName, person.jobTitle, person.department?.name, person.email]
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
  }, [colleagues, memberSearch]);

  const save = useMutation({
    mutationFn: () =>
      api("/conversations", {
        method: "POST",
        body: JSON.stringify({
          type: group ? "GROUP" : "DIRECT",
          ...(group ? { name } : {}),
          memberIds: members,
        }),
      }),
    onSuccess: (r) => {
      onCreated(r.data);
      onClose();
    },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const changeType = (nextGroup) => {
    if (group === nextGroup) return;
    setGroup(nextGroup);
    setMembers([]);
  };
  const toggleMember = (id) => {
    setMembers((selected) => {
      if (!group) return [id];
      return selected.includes(id)
        ? selected.filter((memberId) => memberId !== id)
        : [...selected, id];
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="new-conversation-dialog"
      aria-labelledby="new-conversation-title"
      aria-describedby="new-conversation-description"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form
        className="new-conversation-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (save.isPending || members.length === 0 || (group && name.trim().length < 2)) return;
          save.mutate();
        }}
      >
        <header className="new-conversation-header">
          <span className="new-conversation-header-icon" aria-hidden="true"><Plus size={24} /></span>
          <div className="new-conversation-heading">
            <h2 id="new-conversation-title">New conversation</h2>
            <p id="new-conversation-description">Reach out to a team colleague or form a group channel</p>
          </div>
          <button type="button" className="new-conversation-close modal-close-btn" aria-label="Close new conversation" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="new-conversation-body">
          <div className="new-conversation-types">
            <div className="new-conversation-type-switch" role="group" aria-label="Conversation type">
              <button
                type="button"
                aria-pressed={!group}
                className={!group ? "is-active" : ""}
                onClick={() => changeType(false)}
              >
                <UserRound size={14} />
                Direct message
              </button>
              <button
                type="button"
                aria-pressed={group}
                className={group ? "is-active" : ""}
                onClick={() => changeType(true)}
              >
                <Users size={14} />
                Group
              </button>
            </div>
            <span className="new-conversation-count" aria-live="polite">
              {members.length} {members.length === 1 ? "member" : "members"} selected
            </span>
          </div>

          {group && (
            <label className="new-conversation-name-label">
              <span>Group name <span className="new-conversation-required">*</span></span>
              <span className="new-conversation-name-field">
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  required
                  placeholder="Enter a group name"
                  autoComplete="off"
                />
                <Hash size={16} aria-hidden="true" />
              </span>
            </label>
          )}

          <div className="new-conversation-members-heading">
            <span>{group ? "Members" : "Person / Colleague"}</span>
            <span>Search colleagues</span>
          </div>
          <div className="new-conversation-people-panel">
            <label className="new-conversation-search">
              <Search size={19} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search colleagues"
                placeholder="Type name or branch to filter..."
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div
              className="new-conversation-people-list"
              role={group ? "group" : "radiogroup"}
              aria-label={group ? "Select group members" : "Select a colleague"}
            >
              {users.isLoading ? (
                <p className="new-conversation-list-state">Loading colleagues…</p>
              ) : users.error ? (
                <ErrorBox error={users.error} />
              ) : !filteredColleagues.length ? (
                <p className="new-conversation-list-state">
                  {memberSearch.trim() ? "No matching colleagues found." : "No colleagues available."}
                </p>
              ) : (
                filteredColleagues.map((person, index) => {
                  const isSelected = members.includes(person.id);
                  const initials = (person.displayName || "Colleague")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0] || "")
                    .join("")
                    .toUpperCase();
                  return (
                    <button
                      key={person.id}
                      type="button"
                      role={group ? "checkbox" : "radio"}
                      aria-checked={isSelected}
                      className={"new-conversation-person" + (isSelected ? " is-selected" : "")}
                      onClick={() => toggleMember(person.id)}
                    >
                      <span className={"new-conversation-person-avatar avatar-tone-" + (index % 4)} aria-hidden="true">
                        {initials}
                      </span>
                      <span className="new-conversation-person-details">
                        <span className="new-conversation-person-name">
                          {person.displayName}
                        </span>
                        <span className="new-conversation-person-subtitle">
                          {[person.jobTitle, person.department?.name].filter(Boolean).join(" · ") || "Colleague"}
                        </span>
                      </span>
                      <span className={"new-conversation-check" + (isSelected ? " is-selected" : "")} aria-hidden="true">
                        {isSelected && <Check size={13} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="new-conversation-helper">
            <span className="new-conversation-hint">
              <span className="new-conversation-hint-dot" aria-hidden="true" />
              {group ? "Click to select multiple colleagues." : "Select a colleague to open a private channel."}
            </span>
            <span className="new-conversation-available">{colleagues.length} colleagues available</span>
          </div>
          <ErrorBox error={save.error} />
        </div>
        <footer className="new-conversation-footer">
          <button
            type="submit"
            className="new-conversation-submit"
            disabled={save.isPending || members.length === 0 || (group && name.trim().length < 2)}
          >
            Start conversation <ArrowRight size={17} />
          </button>
        </footer>
      </form>
    </dialog>
  );
}
function Members({ conversation, onClose }) {
  return (
    <Modal title="Conversation Members" onClose={onClose}>
      <div className="conversation-members-modal">
        <div className="conversation-members-current-heading">
          <span>Current members</span>
          <span className="new-conversation-count">
            {conversation.members.length} {conversation.members.length === 1 ? "member" : "members"}
          </span>
        </div>
        <div className="conversation-members-current-list">
          {conversation.members.map((member) => (
            <div key={member.userId} className="conversation-members-current-row">
              <Avatar small name={member.user.displayName} />
              <span className="conversation-members-current-name">{member.user.displayName}</span>
              <span className="conversation-members-current-role">{member.role.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function GroupRenameModal({ conversation, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState(conversation.name || "");
  const rename = useMutation({
    mutationFn: () =>
      api(`/conversations/${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onClose();
    },
  });
  const cleanName = name.trim();
  const canSave = cleanName.length >= 2 && cleanName.length <= 200 &&
    cleanName !== conversation.name && !rename.isPending;

  return (
    <Modal title="Rename Group" onClose={onClose} className="group-action-modal">
      <form
        className="conversation-rename-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) rename.mutate();
        }}
      >
        <label className="conversation-group-field">
          <span>Group name</span>
          <input
            className="input"
            autoFocus
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter group name"
            aria-label="Group name"
          />
        </label>
        <ErrorBox error={rename.error} />
        <div className="conversation-group-modal-actions">
          <button type="submit" className="btn-primary" disabled={!canSave}>
            {rename.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function ChatPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lastChatKey = `${LAST_CHAT_KEY}:${user.id}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedConversationId = searchParams.get("conversation");
  const linkedMessageId = searchParams.get("message");
  const [selectedId, setSelectedId] = useState(
    () => linkedConversationId || sessionStorage.getItem(lastChatKey),
  );
  const [focusMessageId, setFocusMessageId] = useState(linkedMessageId);
  const [text, setText] = useState("");
  const { files, addFiles, removeFile, clearFiles, selectionError } = useSelectedFiles(10);
  const attachmentUploads = useRef(new Map());
  const [reply, setReply] = useState(null);
  const [newChat, setNewChat] = useState(false);
  const [members, setMembers] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [renameGroup, setRenameGroup] = useState(false);
  const [leaveGroupConfirm, setLeaveGroupConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [conversationFilter, setConversationFilter] = useState("all");
  const [messageSearch, setMessageSearch] = useState("");
  const [searchType, setSearchType] = useState("messages");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [receiptDetails, setReceiptDetails] = useState(null);
  const [unreadMarker, setUnreadMarker] = useState(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [reactionFor, setReactionFor] = useState(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [hasWindowAttention, setHasWindowAttention] = useState(
    () => document.visibilityState === "visible" && document.hasFocus(),
  );
  const bottom = useRef(null);
  const composer = useRef(null);
  const scrollArea = useRef(null);
  const groupMenuRef = useRef(null);
  const positionedConversation = useRef(null);
  const previousTail = useRef({ conversationId: null, messageId: null });
  const submittedReads = useRef(new Set());
  const pendingReads = useRef(new Set());
  const readFlushTimer = useRef(null);
  const atBottom = useRef(true);
  const conversationReadTarget = useRef(null);

  useEffect(() => {
    const syncWindowAttention = () =>
      setHasWindowAttention(
        document.visibilityState === "visible" && document.hasFocus(),
      );
    syncWindowAttention();
    window.addEventListener("focus", syncWindowAttention);
    window.addEventListener("blur", syncWindowAttention);
    document.addEventListener("visibilitychange", syncWindowAttention);
    return () => {
      window.removeEventListener("focus", syncWindowAttention);
      window.removeEventListener("blur", syncWindowAttention);
      document.removeEventListener("visibilitychange", syncWindowAttention);
    };
  }, []);

  useEffect(() => {
    if (!groupMenuOpen) return;
    const onPointerDown = (event) => {
      if (!groupMenuRef.current?.contains(event.target)) setGroupMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setGroupMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [groupMenuOpen]);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api("/conversations").then((r) => r.data),
  });
  const selected = conversations.data?.find((c) => c.id === selectedId);
  const visibleConversations = useMemo(() =>
    (conversations.data || []).filter((c) => {
      const textMatches = displayName(c, user.id)?.toLowerCase().includes(search.toLowerCase());
      if (!textMatches) return false;
      if (conversationFilter === "direct") return c.type === "DIRECT";
      if (conversationFilter === "channels") return c.type !== "DIRECT";
      if (conversationFilter === "unread")
        return (c.unreadMessageCount || 0) + (c.unreadReactionCount || 0) > 0;
      return true;
    }), [conversations.data, conversationFilter, search, user.id]);
  const normalizedMessageSearch = messageSearch.trim();
  const messages = useInfiniteQuery({
    queryKey: ["messages", selectedId],
    enabled: Boolean(selectedId),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      api(
        `/conversations/${selectedId}/messages${pageParam ? `?cursor=${pageParam}` : ""}`,
      ),
    getNextPageParam: (page) => page.meta.nextCursor || undefined,
  });
  const pinsQuery = useQuery({
    queryKey: ["message-pins", selectedId],
    enabled: Boolean(selectedId && pinsOpen),
    queryFn: () => api(`/conversations/${selectedId}/pins`).then((r) => r.data),
  });
  const results = useQuery({
    queryKey: [
      "message-search",
      selectedId,
      searchType,
      normalizedMessageSearch,
    ],
    enabled: Boolean(
      selectedId &&
      searchOpen &&
      (searchType !== "messages" || normalizedMessageSearch.length >= 2),
    ),
    queryFn: () =>
      api(
        `/messages/search?${new URLSearchParams({
          q: normalizedMessageSearch,
          conversationId: selectedId,
          type: searchType,
        })}`,
      ).then((r) => r.data),
  });
  const allMessages = useMemo(
    () => messages.data?.pages.toReversed().flatMap((p) => p.data) || [],
    [messages.data],
  );
  const tail = allMessages.at(-1)?.id;
  const unreadMessageIds = useMemo(
    () =>
      new Set(
        allMessages
          .filter(
            (message) =>
              message.senderId !== user.id &&
              message.receipts?.some(
                (receipt) => receipt.userId === user.id && !receipt.readAt,
              ),
          )
          .map((message) => message.id),
      ),
    [allMessages, user.id],
  );
  const firstUnreadId = allMessages.find((message) =>
    unreadMessageIds.has(message.id),
  )?.id;

  const markConversationRead = useCallback(async () => {
    if (
      !selectedId ||
      !hasWindowAttention ||
      !(selected?.unreadCount > 0 || unreadMessageIds.size > 0)
    )
      return;

    const targetKey = `${selectedId}:${tail || "pending"}:${
      selected?.unreadCount || 0
    }:${unreadMessageIds.size}`;
    if (conversationReadTarget.current === targetKey) return;
    conversationReadTarget.current = targetKey;

    try {
      await api(`/conversations/${selectedId}/read`, {
        method: "POST",
        body: JSON.stringify({ all: true }),
      });
      setUnreadMarker(null);
      qc.setQueryData(["conversations"], (items = []) =>
        items.map((item) =>
          item.id === selectedId
            ? {
                ...item,
                unreadMessageCount: 0,
                unreadReactionCount: 0,
                unreadCount: 0,
                unreadReactionMessageId: null,
              }
            : item,
        ),
      );
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      if (conversationReadTarget.current === targetKey)
        conversationReadTarget.current = null;
    }
  }, [
    selectedId,
    tail,
    selected?.unreadCount,
    unreadMessageIds.size,
    hasWindowAttention,
    qc,
  ]);

  useEffect(() => {
    if (!selectedId) {
      setUnreadMarker(null);
      return;
    }
    if (firstUnreadId) {
      setUnreadMarker((current) =>
        current?.conversationId === selectedId
          ? current
          : {
              conversationId: selectedId,
              messageId: firstUnreadId,
              count: selected?.unreadMessageCount || unreadMessageIds.size,
            },
      );
    } else if (unreadMarker?.conversationId === selectedId) {
      setUnreadMarker(null);
    }
  }, [
    selectedId,
    firstUnreadId,
    selected?.unreadMessageCount,
    unreadMessageIds.size,
    unreadMarker?.conversationId,
  ]);

  const clearLinkedTarget = () => {
    if (!linkedConversationId && !linkedMessageId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("conversation");
    next.delete("message");
    setSearchParams(next, { replace: true });
  };

  const selectConversation = (id, reactionMessageId = null) => {
    clearLinkedTarget();
    setFocusMessageId(reactionMessageId);
    setSelectedId(id);
    if (id) sessionStorage.setItem(lastChatKey, id);
  };

  const queueMessageRead = useCallback(
    (messageId) => {
      if (submittedReads.current.has(messageId)) return;
      submittedReads.current.add(messageId);
      pendingReads.current.add(messageId);
      if (readFlushTimer.current) return;
      readFlushTimer.current = window.setTimeout(async () => {
        const ids = [...pendingReads.current];
        pendingReads.current.clear();
        readFlushTimer.current = null;
        if (!ids.length) return;
        try {
          await api("/messages/receipts/read", {
            method: "POST",
            body: JSON.stringify({ messageIds: ids }),
          });
          qc.invalidateQueries({ queryKey: ["messages"] });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        } catch {
          ids.forEach((id) => submittedReads.current.delete(id));
        }
      }, 150);
    },
    [qc],
  );

  useEffect(
    () => () => {
      if (readFlushTimer.current) window.clearTimeout(readFlushTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!selectedId || !selected?.unreadReactionCount || !hasWindowAttention)
      return;
    let cancelled = false;
    api(`/conversations/${selectedId}/reactions/read`, {
      method: "POST",
    })
      .then(() => {
        if (cancelled) return;
        qc.setQueryData(["conversations"], (items = []) =>
          items.map((item) =>
            item.id === selectedId
              ? {
                  ...item,
                  unreadCount: Math.max(
                    0,
                    (item.unreadCount || 0) - (item.unreadReactionCount || 0),
                  ),
                  unreadReactionCount: 0,
                  unreadReactionMessageId: null,
                }
              : item,
          ),
        );
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId, selected?.unreadReactionCount, hasWindowAttention, qc]);

  useEffect(() => {
    if (!conversations.data) return;
    if (
      linkedConversationId &&
      conversations.data.some((c) => c.id === linkedConversationId)
    ) {
      setSelectedId(linkedConversationId);
      sessionStorage.setItem(lastChatKey, linkedConversationId);
      return;
    }
    if (selectedId && !conversations.data.some((c) => c.id === selectedId)) {
      setSelectedId(null);
      sessionStorage.removeItem(lastChatKey);
    }
  }, [conversations.data, linkedConversationId, selectedId]);

  useEffect(() => {
    if (linkedMessageId) setFocusMessageId(linkedMessageId);
  }, [linkedMessageId]);

  useEffect(() => {
    setText("");
    clearFiles();
    attachmentUploads.current.clear();
    setReply(null);
    setMessageSearch("");
    setSearchType("messages");
    setSearchOpen(false);
    setComposerEmojiOpen(false);
    setReactionFor(null);
    setPinsOpen(false);
    setGroupMenuOpen(false);
    setRenameGroup(false);
    setLeaveGroupConfirm(false);
    setMembers(false);
    setNearBottom(true);
    atBottom.current = true;
    conversationReadTarget.current = null;
    positionedConversation.current = null;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || messages.isLoading || !allMessages.length) return;
    if (linkedMessageId || focusMessageId) return;
    if (positionedConversation.current === selectedId) return;
    const target = firstUnreadId
      ? document.getElementById(`message-${firstUnreadId}`)
      : bottom.current;
    target?.scrollIntoView({ block: firstUnreadId ? "center" : "nearest" });
    positionedConversation.current = selectedId;
    previousTail.current = { conversationId: selectedId, messageId: tail };
  }, [
    selectedId,
    messages.isLoading,
    allMessages.length,
    linkedMessageId,
    focusMessageId,
    firstUnreadId,
    tail,
  ]);

  useEffect(() => {
    if (!tail || !selectedId) return;
    const previous = previousTail.current;
    const changed =
      previous.conversationId === selectedId &&
      previous.messageId &&
      previous.messageId !== tail;
    if (changed && nearBottom) {
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (atBottom.current) markConversationRead();
    }
    previousTail.current = { conversationId: selectedId, messageId: tail };
  }, [tail, selectedId, nearBottom, markConversationRead]);

  useEffect(() => {
    if (!selectedId || !tail || messages.isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      const element = scrollArea.current;
      if (!element) return;
      const distanceFromBottom = Math.max(
        0,
        element.scrollHeight - element.scrollTop - element.clientHeight,
      );
      const fullyAtBottom = distanceFromBottom <= 8;
      atBottom.current = fullyAtBottom;
      if (fullyAtBottom) markConversationRead();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    selectedId,
    tail,
    allMessages.length,
    messages.isLoading,
    markConversationRead,
  ]);

  useEffect(() => {
    if (!focusMessageId || messages.isLoading || !selectedId) return;
    const element = document.getElementById(`message-${focusMessageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      positionedConversation.current = selectedId;
      previousTail.current = { conversationId: selectedId, messageId: tail };
      clearLinkedTarget();
      const timeout = window.setTimeout(() => setFocusMessageId(null), 2500);
      return () => window.clearTimeout(timeout);
    }
    if (messages.hasNextPage && !messages.isFetchingNextPage)
      messages.fetchNextPage();
  }, [
    focusMessageId,
    allMessages,
    messages.isLoading,
    messages.hasNextPage,
    messages.isFetchingNextPage,
    selectedId,
  ]);

  useSocket({
    "message:created": (p) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
    },
    "message:updated": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["message-search"] });
    },
    "message:deleted": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["message-search"] });
      qc.invalidateQueries({ queryKey: ["message-pins", p.conversationId] });
    },
    "message:reaction-updated": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    "message:pin-updated": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["message-pins", p.conversationId] });
    },
    "message:receipt-updated": (p) => {
      qc.invalidateQueries({ queryKey: ["messages", p.conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const send = useMutation({
    mutationFn: async ({ id, content, attachments, replyId }) =>
      api(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          attachmentIds: await uploadFiles(attachments, attachmentUploads.current),
          replyToMessageId: replyId,
        }),
      }),
    onSuccess: (_, vars) => {
      if (vars.id === selectedId) {
        setText("");
        clearFiles();
        attachmentUploads.current.clear();
        setReply(null);
      }
      qc.invalidateQueries({ queryKey: ["messages", vars.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const change = useMutation({
    mutationFn: ({ id, remove }) =>
      api(`/messages/${id}`, {
        method: remove ? "DELETE" : "PATCH",
        ...(remove ? {} : { body: JSON.stringify({ content: editText }) }),
      }),
    onSuccess: () => {
      setEditing(null);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
  const react = useMutation({
    mutationFn: ({ messageId, emoji }) =>
      api(`/messages/${messageId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => {
      setReactionFor(null);
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["message-search"] });
    },
  });
  const pinMessage = useMutation({
    mutationFn: ({ messageId, pinned }) =>
      api(`/messages/${messageId}/pin`, {
        method: pinned ? "DELETE" : "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["message-pins", selectedId] });
    },
  });
  const leaveGroup = useMutation({
    mutationFn: (conversationId) =>
      api(`/conversations/${conversationId}/members/${user.id}`, {
        method: "DELETE",
      }),
    onSuccess: (_, conversationId) => {
      setLeaveGroupConfirm(false);
      setGroupMenuOpen(false);
      setMembers(false);
      if (selectedId === conversationId) {
        selectConversation(null);
        sessionStorage.removeItem(lastChatKey);
      }
      qc.setQueryData(["conversations"], (items = []) =>
        items.filter((item) => item.id !== conversationId),
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const submit = () => {
    if (selectedId && (text.trim() || files.length) && !send.isPending)
      send.mutate({
        id: selectedId,
        content: text,
        attachments: files,
        replyId: reply?.id || null,
      });
  };
  const jumpToMessage = (messageId) => {
    if (!messageId) return;
    setSearchOpen(false);
    setPinsOpen(false);
    positionedConversation.current = null;
    setFocusMessageId(messageId);
  };
  const startReply = (message) => {
    setReply(message);
    setReactionFor(null);
    window.requestAnimationFrame(() => composer.current?.focus());
  };
  const insertComposerEmoji = (emoji) => {
    const input = composer.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? start;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    const cursor = start + emoji.length;
    setText(next);
    setComposerEmojiOpen(false);
    window.requestAnimationFrame(() => {
      composer.current?.focus();
      composer.current?.setSelectionRange(cursor, cursor);
    });
  };
  return (
    <>
      <div className="messages-page">
      <PageHeader
        title="Messages"
        description="Real-time team collaboration and system channels"
        action={
          <>
            <button className="btn-primary" onClick={() => setNewChat(true)}>
              <Plus size={17} />
              New conversation
            </button>
          </>
        }
      />
      <ErrorBox error={conversations.error} />
      <div className="chat-shell card flex overflow-hidden h-[calc(100vh-15.2rem)] md:h-[calc(100vh-6.6rem)]">
        <aside className={`chat-sidebar w-full sm:w-64 shrink-0 border-r border-slate-200 flex flex-col ${selectedId ? "chat-sidebar-hidden-mobile" : ""}`}>
          <div className="chat-sidebar-top">
            <div className="chat-sidebar-search">
              <Search size={15} aria-hidden="true" />
              <input
                className="input"
                aria-label="Search conversations"
                placeholder="Find a conversation"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="chat-sidebar-tabs" role="group" aria-label="Conversation types">
              {CONVERSATION_FILTERS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className="chat-sidebar-tab"
                  aria-pressed={conversationFilter === option.id}
                  onClick={() => setConversationFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="chat-sidebar-list flex-1 overflow-y-auto">
            {visibleConversations.map((c) => (
                <button
                  key={c.id}
                  title={displayName(c, user.id)}
                  onClick={() =>
                    selectConversation(c.id, c.unreadReactionMessageId)
                  }
                  className={`chat-conversation-item ${c.id === selectedId ? "is-selected" : ""}`}
                >
                  <div className="chat-conversation-avatar">
                    <Avatar name={displayName(c, user.id)} />
                    {(c.unreadMessageCount || 0) > 0 && <span className="chat-unread-indicator" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-center gap-2">
                      <span className="chat-conversation-title truncate">
                        {displayName(c, user.id)}
                      </span>
                      <span className="chat-conversation-time">{chatListTime(c.messages[0]?.createdAt || c.updatedAt)}</span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="chat-conversation-preview truncate">
                      {c.messages[0]?.content ||
                        (c.messages[0] ? "Attachment" : "Start a conversation")}
                    </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.unreadReactionCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"
                            title={`${c.unreadReactionCount} unread ${c.unreadReactionCount === 1 ? "reaction" : "reactions"}`}
                          >
                            <span className="text-sm leading-none" aria-hidden="true">
                              ♡
                            </span>
                            <span>{chatBadgeLabel(c.unreadReactionCount)}</span>
                          </span>
                        )}
                        {c.unreadMessageCount > 0 && (
                          <span className="chat-unread-count">
                            {chatBadgeLabel(c.unreadMessageCount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            {!visibleConversations.length && !conversations.isLoading && (
              <p className="chat-sidebar-empty">No conversations found.</p>
            )}
          </div>
        </aside>
        <section className={`chat-conversation flex-1 min-w-0 flex-col ${selectedId ? "flex" : "hidden sm:flex"}`}>
          {selected ? (
            <>
              <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
                <button
                  type="button"
                  className="icon-btn sm:hidden"
                  aria-label="Back to conversations"
                  onClick={() => selectConversation(null)}
                >
                  <ArrowLeft size={19} />
                </button>
                <div className="chat-conversation-header-avatar">
                  <Avatar name={displayName(selected, user.id)} />
                </div>
                <div className="chat-conversation-header-identity flex-1 min-w-0">
                  <h2 className="font-semibold text-sm truncate">
                    {displayName(selected, user.id)}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {selected.members.length} members
                  </p>
                </div>
                <div className="chat-message-search relative">
                  <div className="relative">
                    <Search size={16} className="chat-search-icon" />
                    <input
                      className="input pl-9 pr-9"
                      placeholder={
                        searchType === "files"
                          ? "Search files"
                          : searchType === "links"
                            ? "Search links"
                            : "Search messages"
                      }
                      aria-label="Search conversation"
                      value={messageSearch}
                      onFocus={() => setSearchOpen(true)}
                      onChange={(e) => {
                        setMessageSearch(e.target.value);
                        setSearchOpen(true);
                      }}
                    />
                    {searchOpen && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close search"
                        onClick={() => setSearchOpen(false)}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  {searchOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[420px] max-w-[80vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <div className="chat-search-tabs flex border-b border-slate-100 p-1.5">
                        {CHAT_SEARCH_TABS.map(
                          ({ id, label, icon: SearchTypeIcon }) => (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={searchType === id}
                              className="chat-search-tab flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition"
                              onClick={() => setSearchType(id)}
                            >
                              <SearchTypeIcon size={14} />
                              {label}
                            </button>
                          ),
                        )}
                      </div>
                      <div className="max-h-96 overflow-y-auto p-2">
                        {searchType === "messages" &&
                        normalizedMessageSearch.length < 2 ? (
                          <p className="px-3 py-8 text-center text-xs text-slate-400">
                            Type at least 2 characters to search messages.
                          </p>
                        ) : results.isLoading ? (
                          <div className="py-6">
                            <Loading />
                          </div>
                        ) : results.error ? (
                          <ErrorBox error={results.error} />
                        ) : !results.data?.length ? (
                          <p className="px-3 py-8 text-center text-xs text-slate-400">
                            No {searchType} found in this conversation.
                          </p>
                        ) : searchType === "messages" ? (
                          <div className="space-y-1">
                            {results.data.map((result) => (
                              <button
                                key={result.id}
                                type="button"
                                className="w-full rounded-lg p-3 text-left hover:bg-slate-50"
                                onClick={() => jumpToMessage(result.id)}
                              >
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-600">
                                    {result.sender.displayName}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {new Date(
                                      result.createdAt,
                                    ).toLocaleString()}
                                  </span>
                                  <ArrowRight
                                    size={13}
                                    className="ml-auto shrink-0"
                                  />
                                </div>
                                <p className="mt-1 truncate text-sm text-slate-700">
                                  {result.content || "Message"}
                                </p>
                              </button>
                            ))}
                          </div>
                        ) : searchType === "files" ? (
                          <div className="space-y-2">
                            {results.data.map((result) => (
                              <div
                                key={result.id}
                                className="rounded-lg border border-slate-100 p-3"
                              >
                                <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-600">
                                    {result.sender.displayName}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {new Date(
                                      result.createdAt,
                                    ).toLocaleString()}
                                  </span>
                                </div>
                                <Attachments items={[{ file: result.file }]} />
                                <button
                                  type="button"
                                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                                  onClick={() =>
                                    jumpToMessage(result.messageId)
                                  }
                                >
                                  Go to message
                                  <ArrowRight size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {results.data.map((result) => (
                              <div
                                key={result.id}
                                className="rounded-lg border border-slate-100 p-3"
                              >
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-600">
                                    {result.sender.displayName}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {new Date(
                                      result.createdAt,
                                    ).toLocaleString()}
                                  </span>
                                </div>
                                <a
                                  className="mt-2 flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
                                  href={result.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Link2 size={14} className="shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {result.url}
                                  </span>
                                  <ExternalLink
                                    size={13}
                                    className="shrink-0"
                                  />
                                </a>
                                <p className="mt-1 truncate text-xs text-slate-500">
                                  {result.messagePreview}
                                </p>
                                <button
                                  type="button"
                                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                                  onClick={() =>
                                    jumpToMessage(result.messageId)
                                  }
                                >
                                  Go to message
                                  <ArrowRight size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    className="icon-btn"
                    aria-label="Pinned messages"
                    title="Pinned messages"
                    onClick={() => setPinsOpen((open) => !open)}
                  >
                    <Pin size={18} />
                  </button>
                  {pinsOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-80 max-w-[80vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex items-center border-b border-slate-100 px-3 py-2">
                        <span className="flex-1 text-sm font-semibold">
                          Pinned messages
                        </span>
                        <button
                          type="button"
                          className="icon-btn p-1"
                          aria-label="Close pinned messages"
                          onClick={() => setPinsOpen(false)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto p-2">
                        {pinsQuery.isLoading ? (
                          <Loading />
                        ) : pinsQuery.error ? (
                          <ErrorBox error={pinsQuery.error} />
                        ) : !pinsQuery.data?.length ? (
                          <p className="px-3 py-8 text-center text-xs text-slate-400">
                            No pinned messages yet.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {pinsQuery.data.map((item) => (
                              <button
                                key={item.messageId}
                                type="button"
                                className="w-full rounded-lg p-3 text-left hover:bg-slate-50"
                                onClick={() => jumpToMessage(item.messageId)}
                              >
                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                  <Pin size={12} />
                                  <span className="font-semibold text-slate-600">
                                    {item.message.sender.displayName}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {new Date(item.pinnedAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-700">
                                  {item.message.content ||
                                    item.message.attachments[0]?.file
                                      .originalName ||
                                    "Attachment"}
                                </p>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  Pinned by {item.pinnedBy.displayName}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="icon-btn"
                  aria-label="Conversation members"
                  onClick={() => setMembers(true)}
                >
                  <Users size={18} />
                </button>
                {selected.type === "GROUP" && (
                  <div className="chat-group-options" ref={groupMenuRef}>
                    <button
                      type="button"
                      className="icon-btn chat-group-options-trigger"
                      aria-label="Group options"
                      aria-haspopup="menu"
                      aria-expanded={groupMenuOpen}
                      title="Group options"
                      onClick={() => {
                        setPinsOpen(false);
                        setGroupMenuOpen((open) => !open);
                      }}
                    >
                      <EllipsisVertical size={19} />
                    </button>
                    {groupMenuOpen && (
                      <div className="chat-group-options-menu" role="menu" aria-label="Group options">
                        <button
                          type="button"
                          role="menuitem"
                          className="chat-group-options-item"
                          onClick={() => {
                            setGroupMenuOpen(false);
                            setRenameGroup(true);
                          }}
                        >
                          <Pencil size={16} />
                          <span>Rename group</span>
                        </button>
                        <div className="chat-group-options-divider" />
                        <button
                          type="button"
                          role="menuitem"
                          className="chat-group-options-item is-danger"
                          disabled={selected.ownerId === user.id}
                          title={selected.ownerId === user.id ? "Group owners cannot leave until ownership is transferred." : "Leave this group"}
                          onClick={() => {
                            setGroupMenuOpen(false);
                            setLeaveGroupConfirm(true);
                          }}
                        >
                          <LogOut size={16} />
                          <span>Leave group</span>
                        </button>
                        {selected.ownerId === user.id && (
                          <p className="chat-group-options-note">Owners cannot leave their group.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </header>
              <div
                ref={scrollArea}
                className="chat-messages-scroll flex-1 overflow-y-auto p-3 sm:p-5 space-y-5 bg-slate-50/50"
                onScroll={(event) => {
                  const element = event.currentTarget;
                  const distanceFromBottom = Math.max(
                    0,
                    element.scrollHeight -
                      element.scrollTop -
                      element.clientHeight,
                  );
                  const fullyAtBottom = distanceFromBottom <= 8;
                  atBottom.current = fullyAtBottom;
                  setNearBottom(distanceFromBottom < 96);
                  if (fullyAtBottom) markConversationRead();
                }}
              >
                {messages.isLoading ? (
                  <Loading />
                ) : (
                  <>
                    {messages.hasNextPage && (
                      <button
                        className="btn-secondary mx-auto block text-xs"
                        onClick={() => messages.fetchNextPage()}
                        disabled={messages.isFetchingNextPage}
                      >
                        Load earlier messages
                      </button>
                    )}
                    {allMessages.map((m, index) => {
                      const own = m.senderId === user.id;
                      const showDateDivider = index === 0 ||
                        chatDateKey(allMessages[index - 1].createdAt) !== chatDateKey(m.createdAt);
                      const reactionGroups = groupedReactions(
                        m.reactions,
                        user.id,
                      );
                      const unread =
                        !own &&
                        m.receipts?.some(
                          (receipt) =>
                            receipt.userId === user.id && !receipt.readAt,
                        );
                      const showUnreadDivider =
                        unreadMarker?.conversationId === selectedId &&
                        unreadMarker.messageId === m.id;

                      return (
                        <Fragment key={m.id}>
                          {showDateDivider && (
                            <div className="chat-date-divider"><span>{chatDayLabel(m.createdAt)}</span></div>
                          )}
                          {showUnreadDivider && (
                            <div className="flex items-center gap-3 py-1 text-[11px] font-semibold text-blue-600">
                              <span className="h-px flex-1 bg-blue-200" />
                              <span>
                                {unreadMarker.count === 1
                                  ? "1 new message"
                                  : `${unreadMarker.count} new messages`}
                              </span>
                              <span className="h-px flex-1 bg-blue-200" />
                            </div>
                          )}
                          <ReadVisibleMessage
                            enabled={Boolean(unread)}
                            messageId={m.id}
                            onRead={queueMessageRead}
                            className={`chat-message-row flex gap-2 ${own ? "chat-message-own flex-row-reverse" : "chat-message-incoming"} ${focusMessageId === m.id ? "rounded-xl ring-2 ring-blue-300 ring-offset-2" : ""}`}
                          >
                            {!own && (
                              <Avatar small name={m.sender.displayName} />
                            )}
                            <div className="max-w-[90%] sm:max-w-[78%] min-w-0">
                              <div
                                className={`chat-message-meta mb-1 text-[10px] text-slate-400 ${own ? "text-right" : ""}`}
                              >
                                {own ? "You" : m.sender.displayName} ·{" "}
                                {new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {m.editedAt ? " · edited" : ""}
                                {m.pin ? " · 📌 Pinned" : ""}
                              </div>
                              <div
                                className={`chat-message-bubble px-2.5 py-2 rounded-2xl ${own ? "bg-blue-600 text-white rounded-tr-md" : "bg-white border border-slate-200 rounded-tl-md"}`}
                              >
                                {m.replyToMessage && (
                                  <div className="border-l-2 pl-2 mb-3 opacity-60 text-xs truncate">
                                    {m.replyToMessage.sender.displayName}:{" "}
                                    {m.replyToMessage.content || "Message"}
                                  </div>
                                )}
                                <p className="text-sm leading-6 whitespace-pre-wrap break-words">
                                  {m.deletedAt ? (
                                    <em className="opacity-60">
                                      Message deleted
                                    </em>
                                  ) : (
                                    m.content
                                  )}
                                </p>
                                {!m.deletedAt && m.attachments.length > 0 && (
                                  <div className="mt-2">
                                    <Attachments items={m.attachments} />
                                  </div>
                                )}
                              </div>
                              {!m.deletedAt && reactionGroups.length > 0 && (
                                <div
                                  className={`mt-1 flex flex-wrap gap-1 ${own ? "justify-end" : ""}`}
                                >
                                  {reactionGroups.map((group) => (
                                    <button
                                      key={group.emoji}
                                      type="button"
                                      className={`rounded-full border px-2 py-0.5 text-xs ${
                                        group.reactedByMe
                                          ? "border-blue-300 bg-blue-50 text-blue-700"
                                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                      }`}
                                      title={`${reactionLabel(group.emoji)} · ${group.users
                                        .map((item) => item.displayName)
                                        .join(", ")}`}
                                      onClick={() =>
                                        react.mutate({
                                          messageId: m.id,
                                          emoji: group.emoji,
                                        })
                                      }
                                    >
                                      <span className="flex items-center gap-1">
                                        <ReactionGlyph
                                          value={group.emoji}
                                          size={12}
                                        />
                                        <span>{group.users.length}</span>
                                      </span>
                                    </button>
                                  ))}
                                  <ReactionDetailsMenu
                                    groups={reactionGroups}
                                    align={own ? "right" : "left"}
                                  />
                                </div>
                              )}
                              {!m.deletedAt && (
                                <div
                                  className={`chat-message-actions flex gap-1 mt-1 ${own ? "justify-end" : ""}`}
                                >
                                  <button
                                    title="Reply"
                                    aria-label="Reply to message"
                                    className="icon-btn p-1"
                                    onClick={() => startReply(m)}
                                  >
                                    <Reply size={12} />
                                  </button>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      title="React"
                                      aria-label="React to message"
                                      className="icon-btn p-1"
                                      onMouseDown={(event) =>
                                        event.stopPropagation()
                                      }
                                      onClick={() =>
                                        setReactionFor((current) =>
                                          current === m.id ? null : m.id,
                                        )
                                      }
                                    >
                                      <Smile size={12} />
                                    </button>
                                    {reactionFor === m.id && (
                                      <EmojiMenu
                                        align={own ? "right" : "left"}
                                        includeCustom
                                        onClose={() => setReactionFor(null)}
                                        onSelect={(emoji) =>
                                          react.mutate({
                                            messageId: m.id,
                                            emoji,
                                          })
                                        }
                                      />
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    title={
                                      m.pin ? "Unpin message" : "Pin message"
                                    }
                                    aria-label={
                                      m.pin ? "Unpin message" : "Pin message"
                                    }
                                    className={`icon-btn p-1 ${
                                      m.pin ? "text-blue-600" : ""
                                    }`}
                                    disabled={pinMessage.isPending}
                                    onClick={() =>
                                      pinMessage.mutate({
                                        messageId: m.id,
                                        pinned: Boolean(m.pin),
                                      })
                                    }
                                  >
                                    <Pin size={12} />
                                  </button>
                                  {own && (
                                    <>
                                      <button
                                        title="Edit message"
                                        aria-label="Edit message"
                                        className="icon-btn p-1"
                                        onClick={() => {
                                          setEditing(m);
                                          setEditText(m.content);
                                        }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        title="Delete message"
                                        aria-label="Delete message"
                                        className="icon-btn p-1"
                                        onClick={() => setDeleting(m)}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              {own && !m.deletedAt && (
                                <div className="mt-1 flex justify-end">
                                  <MessageReceiptStatus
                                    message={m}
                                    conversation={selected}
                                    onOpen={setReceiptDetails}
                                  />
                                </div>
                              )}
                            </div>
                          </ReadVisibleMessage>
                        </Fragment>
                      );
                    })}
                    {!allMessages.length && (
                      <Empty
                        title="Say hello"
                        text="Send the first message to start the conversation."
                      />
                    )}
                    <div ref={bottom} />
                    {selected.unreadMessageCount > 0 && !nearBottom && (
                      <button
                        type="button"
                        className="sticky bottom-2 z-10 mx-auto block rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm"
                        onClick={() => {
                          bottom.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "end",
                          });
                          markConversationRead();
                        }}
                      >
                        ↓ {chatBadgeLabel(selected.unreadMessageCount)} new
                        messages
                      </button>
                    )}
                  </>
                )}
                <ErrorBox error={messages.error} />
              </div>
              <div className="chat-composer border-t border-slate-100 p-4">
                {reply && (
                  <div className="chat-reply-preview flex items-center gap-2 text-xs bg-blue-50 rounded-lg p-2 mb-2">
                    <Reply size={14} />
                    <span className="truncate flex-1">
                      Replying to {reply.sender.displayName}: {reply.content}
                    </span>
                    <button
                      aria-label="Cancel reply"
                      onClick={() => setReply(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <SelectedFiles
                  files={files}
                  onRemove={removeFile}
                  disabled={send.isPending}
                  className="chat-file-preview mb-2"
                />
                <form
                  className="chat-composer-form flex gap-2 items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <label
                    className="icon-btn mb-1 cursor-pointer"
                    title="Attach file"
                  >
                    <Paperclip size={20} />
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      aria-label="Message attachments"
                      disabled={send.isPending}
                      onChange={addFiles}
                    />
                  </label>
                  <div className="chat-compose-emoji relative mb-1">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Add emoji"
                      aria-label="Add emoji"
                      onMouseDown={(event) => event.stopPropagation()
                      }
                      onClick={() => setComposerEmojiOpen((open) => !open)}
                    >
                      <Smile size={20} />
                    </button>
                    {composerEmojiOpen && (
                      <EmojiMenu
                        onClose={() => setComposerEmojiOpen(false)}
                        onSelect={insertComposerEmoji}
                      />
                    )}
                  </div>
                  <textarea
                    ref={composer}
                    className="chat-compose-textarea input resize-none min-h-12"
                    rows={1}
                    aria-label="Message"
                    placeholder="Write a message…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                  />
                  <button
                    className="chat-send-btn btn-primary px-3"
                    aria-label="Send message"
                    disabled={send.isPending || (!text.trim() && !files.length)}
                  >
                    <Send size={18} />
                  </button>
                </form>
                <ErrorBox error={selectionError || send.error} />
                <p className="chat-compose-hint hidden sm:block text-[10px] text-slate-400 mt-2 ml-11">
                  Enter to send · Shift + Enter for a new line
                </p>
              </div>
            </>
          ) : (
            <Empty
              title="Select a conversation"
              text="Choose a conversation from the list to start messaging."
            />
          )}
        </section>
      </div>
      </div>
      {newChat && (
        <NewChat
          onClose={() => setNewChat(false)}
          onCreated={(conversation) => {
            qc.setQueryData(["conversations"], (items = []) => [
              {
                ...conversation,
                messages: conversation.messages || [],
                unreadCount: 0,
              },
              ...items.filter((item) => item.id !== conversation.id),
            ]);
            selectConversation(conversation.id);
            qc.invalidateQueries({ queryKey: ["conversations"] });
          }}
        />
      )}{" "}
      {members && selected && (
        <Members conversation={selected} onClose={() => setMembers(false)} />
      )}{" "}
      {renameGroup && selected?.type === "GROUP" && (
        <GroupRenameModal
          key={selected.id}
          conversation={selected}
          onClose={() => setRenameGroup(false)}
        />
      )}
      {leaveGroupConfirm && selected?.type === "GROUP" && (
        <Modal
          title="Leave Group"
          onClose={() => {
            if (!leaveGroup.isPending) setLeaveGroupConfirm(false);
          }}
          className="group-action-modal"
        >
          <div className="conversation-leave-modal">
            <p>Are you sure you want to leave <strong>{selected.name}</strong>?</p>
            <p className="conversation-leave-hint">You will no longer see its messages unless you are added to the group again.</p>
            <ErrorBox error={leaveGroup.error} />
            <div className="conversation-group-modal-actions">
              <button
                type="button"
                className="btn-danger"
                disabled={leaveGroup.isPending}
                onClick={() => leaveGroup.mutate(selected.id)}
              >
                {leaveGroup.isPending ? "Leaving…" : "Leave group"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit message" onClose={() => setEditing(null)}>
          <textarea
            className="input min-h-28"
            aria-label="Edited message"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <ErrorBox error={change.error} />
          <div className="form-actions">
            <button
              className="btn-primary"
              disabled={change.isPending || !editText.trim()}
              onClick={() => change.mutate({ id: editing.id })}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
      {receiptDetails && (
        <ReceiptDetails
          details={receiptDetails}
          onClose={() => setReceiptDetails(null)}
        />
      )}{" "}
      {deleting && (
        <Modal title="Delete message?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-500">
            The message will be replaced with “Message deleted”.
          </p>
          <ErrorBox error={change.error} />
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={change.isPending}
              onClick={() => change.mutate({ id: deleting.id, remove: true })}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}