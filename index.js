import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Database from "better-sqlite3";
import session from "express-session";

const app = express();
const db = new Database("./cimol.db");
db.exec("PRAGMA journal_mode=WAL;");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

function requireLogin(req, res, next) {
  console.log("Checking session:", req.session);
  if (!req.session.adminId) {
    console.log("Session invalid, redirecting to /admin-login");
    res.setHeader("HX-Redirect", "/admin-login");
    return res.status(401).send();
  }
  console.log("Session valid, proceeding...");
  next();
}

function HTMLHandler(req, res, htmlPath, data = {}) {
  const filePath = path.join(__dirname, htmlPath);
  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      console.error("Error reading file:", err.message);
      res.writeHead(500);
      res.end("Could not read file");
    } else {
      let modifiedContent = content;
      for (const [key, value] of Object.entries(data)) {
        modifiedContent = modifiedContent.replace(`{{${key}}}`, value);
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(modifiedContent);
    }
  });
}

app.get("/", (req, res) => HTMLHandler(req, res, "views/index.html"));
app.get("/order", (req, res) => HTMLHandler(req, res, "views/order.html"));
app.get("/detailorder", (req, res) => HTMLHandler(req, res, "views/detailorder.html"));
app.get("/admin-login", (req, res) => HTMLHandler(req, res, "views/admin-login.html"));
app.get("/admin", requireLogin, (req, res) => {
  try {
    const stmt = db.prepare("SELECT cabang FROM cabang_tbl WHERE kode_cabang = ?");
    const cabang = stmt.get(req.session.kode_cabang);
    const cabangName = cabang ? cabang.cabang : "Cabang Tidak Diketahui";
    HTMLHandler(req, res, "views/admin.html", { cabangName: `CIMOL BOJOT AA - ${cabangName.toUpperCase()}` });
  } catch (err) {
    console.error("Error fetching cabang:", err.message);
    res.status(500).send("Error fetching cabang");
  }
});
app.get("/masukan", requireLogin, (req, res) => {
  try {
    const stmt = db.prepare("SELECT cabang FROM cabang_tbl WHERE kode_cabang = ?");
    const cabang = stmt.get(req.session.kode_cabang);
    const cabangName = cabang ? cabang.cabang : "Cabang Tidak Diketahui";
    HTMLHandler(req, res, "views/masukan.html", { cabangName: `CIMOL BOJOT AA - ${cabangName.toUpperCase()}` });
  } catch (err) {
    console.error("Error fetching cabang:", err.message);
    res.status(500).send("Error fetching cabang");
  }
});

app.post("/admin-login", (req, res) => {
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

app.post("/form/order", async (req, res) => {
  console.log("POST /form/order received:", req.body);
  try {
    const { nama, telepon, cabang, catatan } = req.body;

    const menuItems = [
      { formName: "cimol_mozarella_kecil", id_menu: 3, menu: "Cimol Mozzarella Kecil", price: 11000 },
      { formName: "cimol_mozarella_besar", id_menu: 4, menu: "Cimol Mozzarella Besar", price: 22000 },
      { formName: "cimol_bojot_kecil", id_menu: 1, menu: "Cimol Bojot Kecil", price: 6000 },
      { formName: "cimol_bojot_besar", id_menu: 2, menu: "Cimol Bojot Besar", price: 12000 },
      { formName: "cimol_ayam_kecil", id_menu: 5, menu: "Cimol Ayam Kecil", price: 11000 },
      { formName: "cimol_ayam_besar", id_menu: 6, menu: "Cimol Ayam Besar", price: 22000 },
      { formName: "cimol_beef_kecil", id_menu: 7, menu: "Cimol Beef Kecil", price: 11000 },
      { formName: "cimol_beef_besar", id_menu: 8, menu: "Cimol Beef Besar", price: 22000 },
    ];

    if (!nama || !telepon || !cabang) {
      console.log("Validation failed: Missing nama, telepon, or cabang");
      return res.status(400).json({ error: "Nama, telepon, dan cabang wajib diisi" });
    }

    let totalHarga = 0;
    const orderedItems = [];

    menuItems.forEach((item) => {
      const quantity = parseInt(req.body[item.formName]) || 0;
      if (quantity > 0) {
        for (let i = 1; i <= quantity; i++) {
          const bumbu = req.body[`bumbu_${item.formName}_${i}`] || '-';
          const topping = req.body[`topping_${item.formName}_${i}`] || '-';
          const level = req.body[`level_${item.formName}_${i}`] || '-';
          totalHarga += item.price;
          orderedItems.push({
            id_menu: item.id_menu,
            menu: item.menu,
            quantity: 1,
            price: item.price,
            bumbu,
            topping,
            level,
            catatan: catatan || '-',
          });
        }
      }
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
      const note = `${item.catatan}\nBumbu: ${item.bumbu}\nTopping: ${item.topping}\nLevel: ${item.level}\nQuantity: ${item.quantity}`;
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
    console.log("Items fetched:", items);

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
    console.log("Response sent:", response);
    res.json(response);
  } catch (err) {
    console.error("Error in GET /api/orders/:id:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

app.post("/kontak", (req, res) => {
  console.log("POST /kontak received:", req.body);
  try {
    const { email, pesan } = req.body;
    if (!email || !pesan) {
      return res.status(400).json({ error: "Email dan pesan wajib diisi" });
    }

    const stmt = db.prepare("INSERT INTO kontak_tbl (email_kontak, pesan_kontak, created_at) VALUES (?, ?, ?)");
    const result = stmt.run(email, pesan, new Date().toISOString());
    console.log("Saved kontak:", { id_kontak: result.lastInsertRowid, email, pesan });

    res.status(200).json({ success: true, message: "Pesan berhasil dikirim!" });
  } catch (err) {
    console.error("Error in POST /kontak:", err.message);
    res.status(500).json({ error: "Kesalahan server", details: err.message });
  }
});

app.get("/api/masukan", requireLogin, (req, res) => {
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

app.post("/api/orders/confirm", async (req, res) => {
  console.log("POST /api/orders/confirm received:", req.body);
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID diperlukan" });
    }

    const stmt = db.prepare("SELECT id_order FROM order_tbl WHERE id_order = ?");
    const order = stmt.get(orderId);
    if (!order) {
      console.log("Order not found:", orderId);
      return res.status(404).json({ error: "Pesanan tidak ditemukan" });
    }

    console.log("Order confirmation acknowledged:", { orderId });
    res.status(200).json({ success: true, message: "Pesanan telah dikirim!" });
  } catch (err) {
    console.error("Error in POST /api/orders/confirm:", err.message);
    res.status(500).json({ error: "Kesalahan server", details: err.message });
  }
});

app.get("/api/orders", requireLogin, async (req, res) => {
  console.log("GET /api/orders called", req.query);
  try {
    const kode_cabang = req.session.kode_cabang;
    const status = req.query.status || '';

    // Query untuk grup berdasarkan id_pembeli
    let query = `
      SELECT o.id_pembeli, MIN(o.id_order) as id_order, c.nama_cust, 
             GROUP_CONCAT(o.note) as notes, GROUP_CONCAT(m.menu) as menus,
             GROUP_CONCAT(o.status_order) as statuses
      FROM order_tbl o
      JOIN customer_tbl c ON o.id_pembeli = c.id_pembeli
      JOIN menu_tbl m ON o.id_menu = m.id_menu
      JOIN cabang_tbl cb ON o.id_cabang = cb.id_cabang
      WHERE cb.kode_cabang = ?
    `;
    const params = [kode_cabang];

    if (status && ['pending', 'confirmed', 'completed'].includes(status)) {
      query += ` AND o.status_order = ?`;
      params.push(status);
    }

    query += ` GROUP BY o.id_pembeli ORDER BY MIN(o.created_at) DESC`;

    const stmt = db.prepare(query);
    const orders = stmt.all(...params);
    console.log("Orders fetched:", orders);

    const formattedOrders = orders.map((order, index) => {
      const noteArray = order.notes.split(',');
      const menuArray = order.menus.split(',');
      const statusArray = order.statuses.split(',');

      // Parse notes untuk setiap menu
      const items = noteArray.map((note, i) => {
        const noteLines = note.split('\n');
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

        return {
          menu: menuArray[i],
          quantity,
          bumbu,
          topping,
          level,
          catatan,
          harga: (() => {
            switch (menuArray[i].toLowerCase()) {
              case 'cimol mozzarella kecil': return quantity * 11000;
              case 'cimol mozzarella besar': return quantity * 22000;
              case 'cimol bojot kecil': return quantity * 6000;
              case 'cimol bojot besar': return quantity * 12000;
              case 'cimol ayam kecil': return quantity * 11000;
              case 'cimol ayam besar': return quantity * 22000;
              case 'cimol beef kecil': return quantity * 11000;
              case 'cimol beef besar': return quantity * 22000;
              default: return 0;
            }
          })(),
        };
      });

      // Hitung total jumlah dan harga
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalHarga = items.reduce((sum, item) => sum + item.harga, 0);

      // Ambil status pertama (semua status sama)
      const status = statusArray[0] === 'pending' ? 'Menunggu' :
                     statusArray[0] === 'confirmed' ? 'Diterima' :
                     statusArray[0] === 'completed' ? 'Selesai' : 'Tidak Diketahui';

      return {
        id_order: order.id_order,
        id_pembeli: order.id_pembeli,
        no: index + 1,
        nama: order.nama_cust,
        items,
        totalQuantity,
        totalHarga,
        status,
        catatan: items[0].catatan, // Catatan sama untuk semua item
      };
    });

    res.json(formattedOrders);
  } catch (err) {
    console.error("Error in GET /api/orders:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

app.post("/api/orders/:id/status", requireLogin, async (req, res) => {
  console.log("=== START POST /api/orders/:id/status ===");
  console.log("Request Headers:", req.headers);
  console.log("Request Params:", req.params);
  console.log("Request Body:", req.body);
  const transaction = db.transaction(() => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      console.log("Parsed input:", { id_order: id, status });

      if (isNaN(id)) {
        console.log("Invalid id_order:", req.params.id);
        return res.status(400).json({ error: "ID pesanan tidak valid" });
      }

      if (!status || !['pending', 'confirmed', 'completed'].includes(status)) {
        console.log("Invalid or missing status:", status);
        return res.status(400).json({ error: "Status tidak valid atau tidak diberikan" });
      }

      // Ambil id_pembeli dari id_order
      const checkStmt = db.prepare("SELECT id_pembeli FROM order_tbl WHERE id_order = ?");
      const order = checkStmt.get(id);
      console.log("Order check result:", order);
      if (!order) {
        console.log("Order not found:", id);
        return res.status(404).json({ error: "Pesanan tidak ditemukan" });
      }

      // Update semua entri dengan id_pembeli yang sama
      const stmt = db.prepare("UPDATE order_tbl SET status_order = ? WHERE id_pembeli = ?");
      console.log("Executing UPDATE with params:", { status, id_pembeli: order.id_pembeli });
      const result = stmt.run(status, order.id_pembeli);
      console.log("Update result:", { changes: result.changes, id_pembeli: order.id_pembeli, status });

      if (result.changes === 0) {
        console.log("No rows updated for id_pembeli:", order.id_pembeli);
        return res.status(404).json({ error: "Gagal memperbarui pesanan" });
      }

      console.log("Order status updated successfully:", { id_pembeli: order.id_pembeli, status });
      res.status(200).json({ success: true, message: "Status pesanan diperbarui" });
    } catch (err) {
      console.error("Error in POST /api/orders/:id/status:", err.message, err.stack);
      res.status(500).json({ error: "Kesalahan server", details: err.message });
    }
  });
  transaction();
});

app.get("/api/test-update/:id/:status", (req, res) => {
  console.log("GET /api/test-update called:", req.params);
  try {
    const id = parseInt(req.params.id);
    const status = req.params.status;
    console.log("Test update:", { id_order: id, status });

    if (isNaN(id)) {
      return res.status(400).json({ error: "ID pesanan tidak valid" });
    }

    if (!['pending', 'confirmed', 'completed'].includes(status)) {
      return res.status(400).json({ error: "Status tidak valid" });
    }

    const stmt = db.prepare("UPDATE order_tbl SET status_order = ? WHERE id_order = ?");
    const result = stmt.run(status, id);
    console.log("Test update result:", result);

    res.json({ success: result.changes > 0, changes: result.changes });
  } catch (err) {
    console.error("Error in test-update:", err.message);
    res.status(500).json({ error: "Kesalahan server", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});