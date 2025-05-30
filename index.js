import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";

const app = express();
const db = new Database("./cimol.db");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

// Middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Handler untuk file HTML
function HTMLHandler(req, res, htmlPath) {
  const filePath = path.join(__dirname, htmlPath);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error("Error reading file:", err.message);
      res.writeHead(500);
      res.end("Could not read file");
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    }
  });
}

// Routes untuk halaman HTML
app.get("/", (req, res) => HTMLHandler(req, res, "views/index.html"));
app.get("/order", (req, res) => HTMLHandler(req, res, "views/order.html"));
app.get("/detailorder", (req, res) => HTMLHandler(req, res, "views/detailorder.html"));
app.get("/admin-login", (req, res) => HTMLHandler(req, res, "views/admin-login.html"));

// Dropdown cabang
app.get("/api/cabang", (req, res) => {
  console.log("GET /api/cabang called");
  try {
    const stmt = db.prepare("SELECT * FROM cabang_tbl");
    const cabang = stmt.all();
    const output = cabang
      .map((element) => `<option value="${element.kode_cabang}">${element.cabang}</option>`)
      .join("");
    res.send(output);
  } catch (err) {
    console.error("Error in /api/cabang:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// Endpoint untuk menyimpan pesanan
app.post("/form/order", async (req, res) => {
  console.log("POST /form/order received:", req.body);
  try {
    const { nama, telepon, cabang, bumbu, topping, level, catatan } = req.body;

    const menuItems = [
      { formName: "cimol_mozarella_kecil", id_menu: 3, menu: "cimol mozzarella kecil", price: 11000 },
      { formName: "cimol_mozarella_besar", id_menu: 4, menu: "cimol mozzarella besar", price: 22000 },
      { formName: "cimol_bojot_kecil", id_menu: 1, menu: "cimol bojot kecil", price: 6000 },
      { formName: "cimol_bojot_besar", id_menu: 2, menu: "cimol bojot besar", price: 12000 },
      { formName: "cimol_ayam_kecil", id_menu: 5, menu: "cimol ayam kecil", price: 11000 },
      { formName: "cimol_ayam_besar", id_menu: 6, menu: "cimol ayam besar", price: 22000 },
      { formName: "cimol_beef_kecil", id_menu: 7, menu: "cimol beef kecil", price: 11000 },
      { formName: "cimol_beef_besar", id_menu: 8, menu: "cimol beef besar", price: 22000 },
    ];

    if (!nama || !telepon || !cabang) {
      console.log("Validation failed: Missing nama, telepon, or cabang");
      return res.status(400).json({ error: "Nama, telepon, dan cabang wajib diisi" });
    }

    let totalHarga = 0;
    const orderedItems = menuItems
      .filter((item) => req.body[item.formName] && parseInt(req.body[item.formName]) > 0)
      .map((item) => {
        const quantity = parseInt(req.body[item.formName]);
        totalHarga += quantity * item.price;
        return { id_menu: item.id_menu, menu: item.menu, quantity, price: item.price };
      });

    if (orderedItems.length === 0) {
      console.log("Validation failed: No menu selected");
      return res.status(400).json({ error: "Pilih minimal satu menu" });
    }

    const customerStmt = db.prepare("INSERT INTO customer_tbl (nama_cust, telepon) VALUES (?, ?)");
    const customerResult = customerStmt.run(nama, telepon);
    const id_pembeli = customerResult.lastInsertRowid;
    console.log("Saved customer:", { id_pembeli, nama, telepon });

    const cabangStmt = db.prepare("SELECT id_cabang FROM cabang_tbl WHERE kode_cabang = ?");
    const cabangRow = cabangStmt.get(cabang);
    if (!cabangRow) {
      console.log("Validation failed: Invalid cabang:", cabang);
      return res.status(400).json({ error: "Cabang tidak valid" });
    }
    const id_cabang = cabangRow.id_cabang;
    console.log("Found cabang:", { id_cabang, kode_cabang: cabang });

    let firstOrderId = null;
    const orderStmt = db.prepare(
      "INSERT INTO order_tbl (id_pembeli, id_menu, id_cabang, note, status_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    orderedItems.forEach((item) => {
      const note = `${catatan || ''}\nBumbu: ${bumbu || '-'}\nTopping: ${topping || '-'}\nLevel: ${level || '-'}\nQuantity: ${item.quantity}`;
      const result = orderStmt.run(
        id_pembeli,
        item.id_menu,
        id_cabang,
        note,
        "pending",
        new Date().toISOString()
      );
      if (!firstOrderId) firstOrderId = result.lastInsertRowid;
      console.log("Saved order:", { id_order: result.lastInsertRowid, id_menu: item.id_menu, quantity: item.quantity });
    });

    res.setHeader('HX-Redirect', `/detailorder?orderId=${firstOrderId}`);
    res.status(200).send();
  } catch (err) {
    console.error("Error in POST /form/order:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// Endpoint untuk detail pesanan
app.get("/api/orders/:id", async (req, res) => {
  console.log("GET /api/orders/:id called:", req.params.id);
  try {
    const orderId = parseInt(req.params.id);
    const orderStmt = db.prepare(`
      SELECT o.*, c.nama_cust, c.telepon, cb.cabang, cb.kode_cabang
      FROM order_tbl o
      JOIN customer_tbl c ON o.id_pembeli = c.id_pembeli
      JOIN cabang_tbl cb ON o.id_cabang = cb.id_cabang
      WHERE o.id_order = ?
    `);
    const order = orderStmt.get(orderId);
    if (!order) {
      console.log("Order not found:", orderId);
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    const itemsStmt = db.prepare(`
      SELECT o.*, m.menu, m.harga
      FROM order_tbl o
      JOIN menu_tbl m ON o.id_menu = m.id_menu
      WHERE o.id_pembeli = ?
    `);
    const items = itemsStmt.all(order.id_pembeli);
    console.log("Items fetched:", items); // Debugging

    let totalHarga = 0;
    const formattedItems = items.map((item) => {
      const noteLines = item.note.split('\n');
      const quantityMatch = noteLines.find((line) => line.startsWith('Quantity:'));
      const quantity = quantityMatch ? parseInt(quantityMatch.replace('Quantity: ', '')) : 1;
      const bumbu = noteLines.find((line) => line.startsWith('Bumbu:'))?.replace('Bumbu: ', '') || '-';
      const topping = noteLines.find((line) => line.startsWith('Topping:'))?.replace('Topping: ', '') || '-';
      const level = noteLines.find((line) => line.startsWith('Level:'))?.replace('Level: ', '') || '-';
      const catatan = noteLines
        .filter(
          (line) =>
            !line.startsWith('Bumbu:') &&
            !line.startsWith('Topping:') &&
            !line.startsWith('Level:') &&
            !line.startsWith('Quantity:')
        )
        .join('\n') || '-';

      totalHarga += quantity * item.harga;

      return {
        name: item.menu,
        quantity,
        harga: item.harga,
        bumbu,
        topping,
        level,
        catatan,
      };
    });

    const response = {
      nama: order.nama_cust,
      telepon: order.telepon,
      cabang: order.cabang,
      kode_cabang: order.kode_cabang,
      items: formattedItems,
      totalHarga,
    };
    console.log("Response sent:", response); // Debugging
    res.json(response);
  } catch (err) {
    console.error("Error in GET /api/orders/:id:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});