import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// Load keys
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Extract videoId from YouTube URL (covers multiple formats)
function getVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1);
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

// Fetch top comments
async function fetchComments(videoId) {
  try {
    const res = await axios.get(
      "https://www.googleapis.com/youtube/v3/commentThreads",
      {
        params: {
          part: "snippet",
          videoId,
          key: YOUTUBE_API_KEY,
          maxResults: 20,
        },
      }
    );

    if (!res.data.items || res.data.items.length === 0) {
      throw new Error("No comments found for this video.");
    }

    return res.data.items
      .map((i) => i.snippet.topLevelComment.snippet.textDisplay)
      .join("\n");
  } catch (err) {
    console.error("❌ Error fetching comments:", err.response?.data || err.message);
    throw new Error("Could not fetch comments. Check the video link or API key.");
  }
}

// ✅ Summarize with Gemini (fixed payload)
async function summarizeComments(comments) {
  try {
    const prompt = `Summarize these YouTube comments in a few bullet points:\n\n${comments}`;

    // SDK lets us pass a string directly
    const result = await model.generateContent(prompt);

    return result.response.text();
  } catch (err) {
    console.error("❌ Error summarizing:", err.message);
    return "⚠️ Could not summarize comments.";
  }
}

// Event: bot ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Event: listen for !summarize command
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!summarize") || message.author.bot) return;

  const args = message.content.split(" ");
  const url = args[1];

  if (!url) return message.reply("⚠️ Please provide a YouTube URL.");
  const videoId = getVideoId(url);
  if (!videoId) return message.reply("⚠️ Invalid YouTube link.");

  await message.reply("⏳ Fetching and summarizing comments...");

  try {
    const comments = await fetchComments(videoId);
    const summary = await summarizeComments(comments);
    message.reply(`📊 **Summary:**\n${summary}`);
  } catch (err) {
    message.reply(`❌ ${err.message}`);
  }
});

// Start bot
client.login(DISCORD_TOKEN);