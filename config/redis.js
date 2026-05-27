const { createClient } = require("redis");

const client = createClient({
  url: process.env.REDIS_URL || "rediss://default:gQAAAAAAAhj2AAIgcDIxODA2MDExMDk1OGY0NGJmYjZjZGM1OTBmNWE3YThkNg@deep-basilisk-137462.upstash.io:6379",
});

client.on("error", (err) => console.error("Redis error:", err));
client.on("connect", () => console.log("Redis connected successfully"));
client.on("reconnecting", () => console.log("Redis reconnecting..."));

// Connect when the module is first imported
client.connect().catch((err) => {
  console.error("Redis initial connection failed:", err.message);
});

module.exports = client;