// routes/feedback.js
import express from "express";
import db from "../config/database.js";
import { requireLogin } from "../middleware/auth.js";
import { getWIBDateTime } from "../utils/helpers.js";

const router = express.Router();

router.post("/kontak", (req, res) => {
    console.log("POST /kontak received:", req.body);
    try {
        const { email, pesan } = req.body;
        if (!email || !pesan) {
            return res.status(400).json({ error: "Email dan pesan wajib diisi" });
        }

        const stmt = db.prepare("INSERT INTO kontak_tbl (email_kontak, pesan_kontak, created_at) VALUES (?, ?, ?)");
        const result = stmt.run(email, pesan, getWIBDateTime());
        console.log("Saved kontak:", { id_kontak: result.lastInsertRowid, email, pesan, created_at: getWIBDateTime() });

        res.status(200).json({ success: true, message: "Pesan berhasil dikirim!" });
    } catch (err) {
        console.error("Error in POST /kontak:", err.message);
        res.status(500).json({ error: "Kesalahan server", details: err.message });
    }
});

router.get("/api/masukan", requireLogin, (req, res) => {
    console.log("GET /api/masukan called");
    try {
        const stmt = db.prepare("SELECT pesan_kontak FROM kontak_tbl ORDER BY created_at DESC");
        const masukan = stmt.all();
        res.json(masukan);
    } catch (err) {
        console.error("Error in GET /api/masukan:", err.message);
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

export default router;