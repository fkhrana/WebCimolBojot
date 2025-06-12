// index.js
import express from "express";
import session from "express-session";
import indexRoutes from "./routes/index.js";
import authRoutes from "./routes/auth.js";
import orderRoutes from "./routes/orders.js";
import feedbackRoutes from "./routes/feedback.js";

const app = express();
const PORT = 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "cimolbojotaa_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// Gunakan routes
app.use("/", indexRoutes);
app.use("/auth", authRoutes);
app.use("/orders", orderRoutes);
app.use("/feedback", feedbackRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});