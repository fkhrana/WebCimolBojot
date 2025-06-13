// setup aplikasi

import express from "express"; // ngebuat server web
import session from "express-session"; // login
import indexRoutes from "./routes/index.js"; // daftar perintah buat halaman utama
import authRoutes from "./routes/auth.js"; // daftar perintah buat login admin
import orderRoutes from "./routes/orders.js"; // daftar perintah buat urusan orderan
import feedbackRoutes from "./routes/feedback.js"; // daftar perintah buat masukan pelanggan

const app = express(); // bikin aplikasi web baru
const PORT = 3000; // alamt port biar bisa jalan

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true })); // buat ngeparsing data (ambil data teks terus diubah ke bentuk yang dipahamin program) dari form
app.use(express.json());
app.use(
  session({
    secret: "cimolbojotaa_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // nyimpen id sesi di browser
  })
);

// gunain ruotes buat atur perintah
app.use("/", indexRoutes);
app.use("/auth", authRoutes);
app.use("/orders", orderRoutes);
app.use("/feedback", feedbackRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});