import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express"
import Database from "better-sqlite3";

const app=express()
const db = new Database("./cimol.db");

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const PORT= 3000;

app.use(express.static("public"));
app.get("/",(req,res)=>HTMLHandler(req,res,"views/index.html"))
app.get("/order",(req,res)=>HTMLHandler(req,res,"views/order.html"))
app.get("/detailorder",(req,res)=>HTMLHandler(req,res,"views/detailorder.html"))
app.get("/admin",(req,res)=>HTMLHandler(req,res,"views/admin.html"))

app.listen(PORT, () => {
  console.log("Example app listening on port ${PORT}")
})

function HTMLHandler(req, res, htmlPath) {
  const filePath = path.join(_dirname, htmlPath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end("Could not read file");
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    }
  });
}

app.get("/api/menu", (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM menu_tbl");
    const menu = stmt.all();
    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});