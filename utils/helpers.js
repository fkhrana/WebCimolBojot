// utils/helpers.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getWIBDateTime() {
    const wibTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return wibTime.toISOString().slice(0, 19).replace("T", " ");
}

export function HTMLHandler(req, res, htmlPath, data = {}) {
    try {
        const filePath = path.join(__dirname, "../", htmlPath);
        let content = fs.readFileSync(filePath, "utf8");
        for (const [key, value] of Object.entries(data)) {
            content = content.replace(`{{${key}}}`, value);
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
    } catch (err) {
        console.error("Error reading file:", err.message);
        res.status(500).send("Could not read file");
    }
}

export function getCabangName(kode_cabang) {
    try {
        const stmt = db.prepare("SELECT cabang FROM cabang_tbl WHERE kode_cabang = ?");
        const cabang = stmt.get(kode_cabang);
        return cabang ? `CIMOL BOJOT AA - ${cabang.cabang.toUpperCase()}` : "CIMOL BOJOT AA - Cabang Tidak Diketahui";
    } catch (err) {
        console.error("Error fetching cabang:", err.message);
        throw err;
    }
}