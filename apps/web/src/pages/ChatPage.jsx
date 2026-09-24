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
} from "lucide-react";
import { api, uploadFile } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import PageHeader from "../components/PageHeader.jsx";
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
  const [group, setGroup] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
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
  return (
    <Modal title="New conversation" onClose={onClose}>
      <div className="tabs mb-5">
        <button
          className={!group ? "active" : ""}
          onClick={() => {
            setGroup(false);
            setMembers([]);
          }}
        >
          Direct message
        </button>
        <button
          className={group ? "active" : ""}
          onClick={() => {
            setGroup(true);
            setMembers([]);
          }}
        >
          Group
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {group && (
          <Field
            label="Group name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <Field label={group ? "Members" : "Person"}>
          <select
            className={`input ${group ? "h-40" : ""}`}
            multiple={group}
            required
            value={group ? members : members[0] || ""}
            onChange={(e) =>
              setMembers([...e.target.selectedOptions].map((o) => o.value))
            }
          >
            {!group && <option value="">Choose a colleague</option>}
            {users.data
              ?.filter((u) => u.id !== user.id && u.status === "ACTIVE")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
          </select>
        </Field>
        {group && (
          <p className="mt-2 text-xs text-slate-400">
            Hold Ctrl / Cmd to select multiple people.
          </p>
        )}
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button className="btn-primary" disabled={save.isPending}>
            Start conversation
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Members({ conversation, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [id, setId] = useState("");
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users").then((r) => r.data),
  });
  const save = useMutation({
    mutationFn: (remove) =>
      remove
        ? api(`/conversations/${conversation.id}/members/${remove}`, {
            method: "DELETE",
          })
        : api(`/conversations/${conversation.id}/members`, {
            method: "POST",
            body: JSON.stringify({ userId: id }),
          }),
    onSuccess: () => {
      setId("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const owner = conversation.ownerId === user.id;
  return (
    <Modal title="Conversation members" onClose={onClose}>
      <div className="space-y-4">
        {conversation.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 text-sm">
            <Avatar small name={m.user.displayName} />
            <span className="flex-1">{m.user.displayName}</span>
            <span className="text-xs text-slate-400">
              {m.role.toLowerCase()}
            </span>
            {owner &&
              m.userId !== user.id &&
              conversation.type !== "DIRECT" && (
                <button
                  className="icon-btn"
                  aria-label={`Remove ${m.user.displayName}`}
                  onClick={() => save.mutate(m.userId)}
                >
                  <X size={16} />
                </button>
              )}
          </div>
        ))}
      </div>
      {owner && conversation.type !== "DIRECT" && (
        <form
          className="mt-6 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(null);
          }}
        >
          <select
            aria-label="Add member"
            className="input"
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            <option value="">Add a colleague…</option>
            {users.data
              ?.filter(
                (u) =>
                  u.status === "ACTIVE" &&
                  !conversation.members.some((m) => m.userId === u.id),
              )
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
          </select>
          <button className="btn-primary" disabled={save.isPending}>
            Add
          </button>
        </form>
      )}
      {!owner && conversation.type !== "DIRECT" && (
        <button
          className="btn-danger mt-6"
          onClick={async () => {
            await save.mutateAsync(user.id);
            onClose();
          }}
        >
          Leave group
        </button>
      )}
      <ErrorBox error={save.error} />
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
  const [file, setFile] = useState(null);
  const [reply, setReply] = useState(null);
  const [newChat, setNewChat] = useState(false);
  const [members, setMembers] = useState(false);
  const [search, setSearch] = useState("");
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

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api("/conversations").then((r) => r.data),
  });
  const selected = conversations.data?.find((c) => c.id === selectedId);
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
    setFile(null);
    setReply(null);
    setMessageSearch("");
    setSearchType("messages");
    setSearchOpen(false);
    setComposerEmojiOpen(false);
    setReactionFor(null);
    setPinsOpen(false);
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
    mutationFn: async ({ id, content, attachment, replyId }) =>
      api(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          attachmentIds: attachment ? [(await uploadFile(attachment)).id] : [],
          replyToMessageId: replyId,
        }),
      }),
    onSuccess: (_, vars) => {
      if (vars.id === selectedId) {
        setText("");
        setFile(null);
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
  const submit = () => {
    if (selectedId && (text.trim() || file) && !send.isPending)
      send.mutate({
        id: selectedId,
        content: text,
        attachment: file,
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
      <PageHeader
        title="Messages"

        action={
          <button className="btn-primary" onClick={() => setNewChat(true)}>
            <Plus size={17} />
            New conversation
          </button>
        }
      />
      <ErrorBox error={conversations.error} />
      <div className="chat-shell card flex overflow-hidden h-[calc(100vh-6.6rem)]">
        <aside className={`chat-sidebar w-full sm:w-64 shrink-0 border-r border-slate-200 flex flex-col ${selectedId ? "chat-sidebar-hidden-mobile" : ""}`}>
          <div className="p-3 sm:p-4">
            <input
              className="input"
              aria-label="Search conversations"
              placeholder="Find a conversation"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.data
              ?.filter((c) =>
                displayName(c, user.id)
                  ?.toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  title={displayName(c, user.id)}
                  onClick={() =>
                    selectConversation(c.id, c.unreadReactionMessageId)
                  }
                  className={`flex w-full gap-3 items-center p-4 text-left border-l-2 ${c.id === selectedId ? "border-blue-600 bg-blue-50/70" : "border-transparent hover:bg-slate-50"}`}
                >
                  <Avatar name={displayName(c, user.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {displayName(c, user.id)}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="rounded-full px-1.5 py-0.5 bg-blue-600 text-white text-[10px]">
                          {chatBadgeLabel(c.unreadCount)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs mt-1 text-slate-400">
                      {c.messages[0]?.content ||
                        (c.messages[0] ? "Attachment" : "Start a conversation")}
                    </p>
                  </div>
                </button>
              ))}
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
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-sm truncate">
                    {displayName(selected, user.id)}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {selected.members.length} members
                  </p>
                </div>
                <div className="relative hidden w-64 sm:block lg:w-80">
                  <div className="relative">
                    <Search
                      size={16}
                      className={`pointer-events-none absolute right-3 ${searchOpen ? "opacity-0" : "opacity-100"}  top-1/2 -translate-y-1/2 text-slate-400`}
                    />
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
                      <div className="flex border-b border-slate-100 p-1.5">
                        {CHAT_SEARCH_TABS.map(
                          ({ id, label, icon: SearchTypeIcon }) => (
                            <button
                              key={id}
                              type="button"
                              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                                searchType === id
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                              }`}
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
              </header>
              <div
                ref={scrollArea}
                className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-5 bg-slate-50/50"
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
                    {allMessages.map((m) => {
                      const own = m.senderId === user.id;
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
                            className={`flex gap-2 ${own ? "flex-row-reverse" : ""} ${focusMessageId === m.id ? "rounded-xl ring-2 ring-blue-300 ring-offset-2" : ""}`}
                          >
                            {!own && (
                              <Avatar small name={m.sender.displayName} />
                            )}
                            <div className="max-w-[90%] sm:max-w-[78%] min-w-0">
                              <div
                                className={`mb-1 text-[10px] text-slate-400 ${own ? "text-right" : ""}`}
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
                                className={`p-3.5 rounded-2xl ${own ? "bg-blue-600 text-white rounded-tr-md" : "bg-white border border-slate-200 rounded-tl-md"}`}
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
                              {!m.deletedAt && m.reactions?.length > 0 && (
                                <div
                                  className={`mt-1 flex flex-wrap gap-1 ${own ? "justify-end" : ""}`}
                                >
                                  {groupedReactions(m.reactions, user.id).map(
                                    (group) => (
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
                                    ),
                                  )}
                                </div>
                              )}
                              {!m.deletedAt && (
                                <div
                                  className={`flex gap-1 mt-1 ${own ? "justify-end" : ""}`}
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
              <div className="border-t border-slate-100 p-4">
                {reply && (
                  <div className="flex items-center gap-2 text-xs bg-blue-50 rounded-lg p-2 mb-2">
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
                {file && (
                  <div className="flex gap-2 text-xs text-slate-500 mb-2">
                    <Paperclip size={13} />
                    {file.name}
                    <button
                      aria-label="Remove attachment"
                      onClick={() => setFile(null)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                <form
                  className="flex gap-2 items-end"
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
                      className="sr-only"
                      aria-label="Message attachment"
                      onChange={(e) => setFile(e.target.files[0])}
                    />
                  </label>
                  <div className="relative mb-1">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Add emoji"
                      aria-label="Add emoji"
                      onMouseDown={(event) => event.stopPropagation()}
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
                    className="input resize-none min-h-12"
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
                    className="btn-primary px-3"
                    aria-label="Send message"
                    disabled={send.isPending || (!text.trim() && !file)}
                  >
                    <Send size={18} />
                  </button>
                </form>
                <ErrorBox error={send.error} />
                <p className="hidden sm:block text-[10px] text-slate-400 mt-2 ml-11">
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
