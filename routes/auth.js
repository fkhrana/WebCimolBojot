// routes/auth.js
import express from "express";
import db from "../config/database.js";

const router = express.Router();

router.post("/admin-login", (req, res) => {
    console.log("POST /admin-login received:", req.body);
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username dan password wajib diisi" });
        }

        const stmt = db.prepare("SELECT * FROM admin_tbl WHERE username = ? AND password = ?");
        const admin = stmt.get(username, password);

        if (!admin) {
            console.log("Login failed: Invalid username or password");
            return res.status(401).json({ error: "Username atau password salah" });
        }

        req.session.adminId = admin.id_admin;
        req.session.username = admin.username;
        req.session.kode_cabang = admin.kode_cabang;
        console.log("Session set:", req.session);

        res.setHeader("HX-Redirect", "/admin");
        res.status(200).send();
    } catch (err) {
        console.error("Error in POST /admin-login:", err.message);
        res.status(500).json({ error: "Kesalahan server", details: err.message });
    }
});

export default router;