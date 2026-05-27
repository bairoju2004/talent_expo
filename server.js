require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const cookieParser = require("cookie-parser"); // ← NEW
const passport = require("./config/passport");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const redis = require("./config/redis");
const Message = require("./models/Message");
const createNotification = require("./utils/createNotification");

const customerRoutes      = require("./routes/customerRoutes");
const artistRoutes        = require("./routes/artistRoutes");
const authRoutes          = require("./routes/authRoutes");
const messageRoutes       = require("./routes/messageRoutes");
const postRoutes          = require("./routes/postRoutes");
const reviewRoutes        = require("./routes/reviewRoutes");
const adminRoutes         = require("./routes/adminRoutes");
const notificationRoutes  = require("./routes/notificationRoutes");

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.set("io", io);
connectDB();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser()); // ← NEW — must be before routes
app.use(passport.initialize());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth",          authRoutes);
app.use("/api/artist",        artistRoutes);
app.use("/api/customer",      customerRoutes);
app.use("/api/bookings",      require("./routes/bookingRoutes"));
app.use("/api/messages",      messageRoutes);
app.use("/api/posts",         postRoutes);
app.use("/api/reviews",       reviewRoutes);
app.use("/api/admin",         adminRoutes);
app.use("/api/notifications", notificationRoutes);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinUserRoom", (userId) => socket.join(`user:${userId}`));
  socket.on("joinRoom",     (bookingId) => socket.join(bookingId));

  socket.on("sendMessage", async (data) => {
    try {
      const message = await Message.create({
        bookingId:  data.bookingId,
        sender:     data.senderId,
        senderName: data.senderName,
        text:       data.text,
        isRead:     false,
      });

      const payload = {
        _id:        message._id,
        bookingId:  message.bookingId,
        sender:     message.sender,
        senderName: message.senderName,
        text:       message.text,
        isRead:     message.isRead,
        createdAt:  message.createdAt,
      };

      io.to(data.bookingId).emit("receiveMessage", payload);

      if (data.recipientId) {
        await createNotification(io, {
          recipientId: data.recipientId,
          type:        "new_message",
          title:       `New message from ${data.senderName}`,
          body:        data.text.length > 80 ? data.text.slice(0, 77) + "..." : data.text,
          bookingId:   data.bookingId,
        });
      }
    } catch (error) {
      console.error("Message save error:", error);
    }
  });

  socket.on("readMessages", ({ bookingId, readBy }) => {
    socket.to(bookingId).emit("messagesRead", { readBy });
  });

  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
