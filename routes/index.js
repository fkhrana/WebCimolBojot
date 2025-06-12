// routes/index.js
import express from "express";
import { HTMLHandler, getCabangName } from "../utils/helpers.js";
import { requireLogin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", (req, res) => HTMLHandler(req, res, "views/index.html"));
router.get("/order", (req, res) => HTMLHandler(req, res, "views/order.html"));
router.get("/detailorder", (req, res) => HTMLHandler(req, res, "views/detailorder.html"));
router.get("/admin-login", (req, res) => HTMLHandler(req, res, "views/admin-login.html"));

router.get("/admin", requireLogin, (req, res) => {
    try {
        const cabangName = getCabangName(req.session.kode_cabang);
        HTMLHandler(req, res, "views/admin.html", { cabangName });
    } catch (err) {
        res.status(500).send("Error fetching cabang");
    }
});

router.get("/masukan", (req, res) => {
    try {
        const cabangName = getCabangName(req.session.kode_cabang);
        HTMLHandler(req, res, "views/masukan.html", { cabangName });
    } catch (err) {
        res.status(500).send("Error fetching cabang");
    }
});

export default router;