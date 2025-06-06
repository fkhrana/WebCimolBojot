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

function getWIBDateTime() {
  const wibTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wibTime.toISOString().slice(0, 19).replace('T', ' ');
}

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
  try {
    const filePath = path.join(__dirname, htmlPath);
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

app.get("/", (req, res) => HTMLHandler(req, res, "views/index.html"));
app.get("/order", (req, res) => HTMLHandler(req, res, "views/order.html"));
app.get("/detailorder", (req, res) => HTMLHandler(req, res, "views/detailorder.html"));
app.get("/admin-login", (req, res) => HTMLHandler(req, res, "views/admin-login.html"));

function getCabangName(kode_cabang, db) {
  try {
    const stmt = db.prepare("SELECT cabang FROM cabang_tbl WHERE kode_cabang = ?");
    const cabang = stmt.get(kode_cabang);
    return cabang ? `CIMOL BOJOT AA - ${cabang.cabang.toUpperCase()}` : "CIMOL BOJOT AA - Cabang Tidak Diketahui";
  } catch (err) {
    console.error("Error fetching cabang:", err.message);
    throw err;
  }
}

app.get("/admin", requireLogin, (req, res) => {
  try {
    const cabangName = getCabangName(req.session.kode_cabang, db);
    HTMLHandler(req, res, "views/admin.html", { cabangName });
  } catch (err) {
    res.status(500).send("Error fetching cabang");
  }
});

app.get("/masukan", requireLogin, (req, res) => {
  try {
    const cabangName = getCabangName(req.session.kode_cabang, db);
    HTMLHandler(req, res, "views/masukan.html", { cabangName });
  } catch (err) {
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

    const phoneStr = telepon.toString().trim();
    if (!phoneStr.match(/^08[0-9]{8,11}$/)) {
      console.log("Validation failed: Invalid phone number", phoneStr);
      return res.status(400).json({ error: "Nomor telepon harus diawali 08 dan berisi 10-13 digit" });
    }

    const menuBase = [
      { type: "mozarella", idBase: 3, name: "Mozzarella Porsi Kecil", priceKecil: 11000, priceBesar: 22000 },
      { type: "bojot", idBase: 1, name: "Bojot Porsi Kecil", priceKecil: 6000, priceBesar: 12000 },
      { type: "ayam", idBase: 5, name: "Ayam Porsi Kecil", priceKecil: 11000, priceBesar: 22000 },
      { type: "beef", idBase: 7, name: "Beef Porsi Kecil", priceKecil: 11000, priceBesar: 22000 },
    ];

    const menuItems = menuBase.flatMap(({ type, idBase, name, priceKecil, priceBesar }) => [
      { formName: `cimol_${type}_kecil`, idMenu: idBase, menu: `Cimol ${name}`, price: priceKecil },
      { formName: `cimol_${type}_besar`, idMenu: idBase + 1, menu: `Cimol ${name.replace("Kecil", "Besar")}`, price: priceBesar },
    ]);

    if (!nama || !phoneStr || !cabang) {
      console.log("Validation failed: Missing nama, telepon, or cabang");
      return res.status(400).json({ error: "Nama, telepon, dan cabang wajib diisi" });
    }

    let totalHarga = 0;
    const orderedItems = [];

    menuItems.forEach((item) => {
      const quantity = parseInt(req.body[item.formName]) || 0;
      console.log(`Processing ${item.formName}: ${quantity}`);
      if (quantity > 0) {
        for (let i = 1; i <= quantity; i++) {
          const bumbu = req.body[`bumbu_${item.formName}_${i}`] || '-';
          const topping = req.body[`topping_${item.formName}_${i}`] || '-';
          const level = req.body[`level_${item.formName}_${i}`] || '-';
          console.log(`Item ${i} for ${item.formName}:`, { bumbu, topping, level });
          totalHarga += item.price;
          orderedItems.push({
            id_menu: item.idMenu,
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

    console.log("Final orderedItems:", orderedItems);

    if (orderedItems.length === 0) {
      console.log("Validation failed: No menu selected");
      return res.status(400).json({ error: "Pilih minimal satu menu" });
    }

    const cabangStmt = db.prepare("SELECT id_cabang FROM cabang_tbl WHERE kode_cabang = ?");
    const cabangRow = cabangStmt.get(cabang);
    if (!cabangRow) {
      console.log("Validation failed: Invalid cabang:", cabang);
      return res.status(400).json({ error: "Cabang tidak valid" });
    }

    req.session.pendingOrder = {
      nama,
      telepon: phoneStr,
      cabang,
      id_cabang: cabangRow.id_cabang,
      items: orderedItems,
      totalHarga,
      created_at: getWIBDateTime(),
    };

    const tempOrderId = Date.now();
    req.session.pendingOrder.tempOrderId = tempOrderId;

    console.log("Pending order saved to session:", req.session.pendingOrder);

    res.setHeader('HX-Redirect', `/detailorder?orderId=${tempOrderId}`);
    res.status(200).send();
  } catch (err) {
    console.error("Error in POST /form/order:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  console.log("GET /api/orders/:id called:", req.params.id);
  try {
    const orderId = req.params.id;

    if (req.session.pendingOrder && req.session.pendingOrder.tempOrderId == orderId) {
      const order = req.session.pendingOrder;
      const cabangStmt = db.prepare("SELECT cabang FROM cabang_tbl WHERE id_cabang = ?");
      const cabang = cabangStmt.get(order.id_cabang);

      // Mapping foto untuk session-based order, sesuai menu_tbl
      const menuFotoMap = {
        "Cimol Mozzarella Porsi Kecil": "/cimolmoza.png",
        "Cimol Mozzarella Porsi Besar": "/cimolmoza.png",
        "Cimol Bojot Porsi Kecil": "/cimolbojot.png",
        "Cimol Bojot Porsi Besar": "/cimolbojot.png",
        "Cimol Ayam Porsi Kecil": "/cimolayam.png",
        "Cimol Ayam Porsi Besar": "/cimolayam.png",
        "Cimol Beef Porsi Kecil": "/cimolbeef.png",
        "Cimol Beef Porsi Besar": "/cimolbeef.png",
      };

      const response = {
        nama: order.nama,
        telepon: order.telepon,
        cabang: cabang ? cabang.cabang : "Tidak Diketahui",
        kode_cabang: order.cabang,
        items: order.items.map(item => ({
          name: item.menu,
          quantity: item.quantity,
          harga: item.price,
          bumbu: item.bumbu,
          topping: item.topping,
          level: item.level,
          catatan: item.catatan,
          foto: menuFotoMap[item.menu] || "/cimolmoza.png", // Fallback
        })),
        totalHarga: order.totalHarga,
      };
      console.log("Response from session:", response);
      return res.json(response);
    }

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
      SELECT o.*, m.menu, m.harga, m.foto
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
        foto: item.foto || "/cimolmoza.png", // Fallback
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

app.post("/api/orders/confirm", async (req, res) => {
  console.log("POST /api/orders/confirm received:", req.body);
  try {
    const { orderId } = req.body;
    if (!orderId) {
      console.log("Missing orderId in request body");
      return res.status(400).json({ error: "Order ID diperlukan" });
    }

    if (!req.session.pendingOrder || req.session.pendingOrder.tempOrderId != orderId) {
      console.log("Pending order not found in session:", { orderId, session: req.session.pendingOrder });
      return res.status(404).json({ error: "Pesanan sementara tidak ditemukan" });
    }

    const { nama, telepon, id_cabang, items } = req.session.pendingOrder;
    const created_at = getWIBDateTime();
    console.log("Order data from session:", { nama, telepon, id_cabang, items, created_at });

    const checkCustomerStmt = db.prepare("SELECT id_pembeli FROM customer_tbl WHERE telepon = ?");
    const existingCustomer = checkCustomerStmt.get(telepon);
    let id_pembeli;

    if (existingCustomer) {
      id_pembeli = existingCustomer.id_pembeli;
      console.log("Existing customer found:", { id_pembeli, telepon });
    } else {
      const customerStmt = db.prepare("INSERT INTO customer_tbl (nama_cust, telepon) VALUES (?, ?)");
      const customerResult = customerStmt.run(nama, telepon);
      id_pembeli = customerResult.lastInsertRowid;
      console.log("New customer saved:", { id_pembeli, nama, telepon });
    }

    const cabangStmt = db.prepare("SELECT id_cabang FROM cabang_tbl WHERE id_cabang = ?");
    const cabangRow = cabangStmt.get(id_cabang);
    if (!cabangRow) {
      console.log("Invalid id_cabang:", id_cabang);
      return res.status(400).json({ error: "Cabang tidak valid" });
    }

    let firstOrderId = null;
    const orderStmt = db.prepare(
      "INSERT INTO order_tbl (id_pembeli, id_menu, id_cabang, note, status_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const item of items) {
      const note = `${item.catatan}\nBumbu: ${item.bumbu}\nTopping: ${item.topping}\nLevel: ${item.level}\nQuantity: ${item.quantity}`;
      console.log("Inserting order item:", { id_pembeli, id_menu: item.id_menu, id_cabang, note, status: "pending", created_at });
      const result = orderStmt.run(
        id_pembeli,
        item.id_menu,
        id_cabang,
        note,
        "pending",
        created_at
      );
      if (!firstOrderId) firstOrderId = result.lastInsertRowid;
      console.log("Order saved:", { id_order: result.lastInsertRowid, id_menu: item.id_menu, quantity: item.quantity, created_at });
    }

    delete req.session.pendingOrder;
    console.log("Pending order cleared from session");

    res.setHeader('HX-Redirect', `/detailorder?orderId=${firstOrderId}`);
    res.status(200).json({ success: true, message: "Pesanan telah dikirim!", id_order: firstOrderId });
  } catch (err) {
    console.error("Error in POST /api/orders/confirm:", err.message, err.stack);
    res.status(500).json({ error: "Kesalahan server", details: err.message });
  }
});

app.post("/api/orders/cancel", async (req, res) => {
  console.log("POST /api/orders/cancel received:", req.body);
  try {
    const { orderId } = req.body;
    if (!orderId || !req.session.pendingOrder || req.session.pendingOrder.tempOrderId != orderId) {
      console.log("No pending order to cancel:", orderId);
      return res.status(404).json({ error: "Pesanan sementara tidak ditemukan" });
    }

    // Hapus pesanan sementara dari session
    delete req.session.pendingOrder;
    console.log("Pending order cancelled and cleared from session");

    res.setHeader('HX-Redirect', '/order');
    res.status(200).send();
  } catch (err) {
    console.error("Error in POST /api/orders/cancel:", err.message);
    res.status(500).json({ error: "Kesalahan server", details: err.message });
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
    const result = stmt.run(email, pesan, getWIBDateTime());
    console.log("Saved kontak:", { id_kontak: result.lastInsertRowid, email, pesan, created_at: getWIBDateTime() });

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

app.get("/api/orders", requireLogin, async (req, res) => {
  console.log("GET /api/orders called", {
    query: req.query,
    kode_cabang: req.session.kode_cabang,
    timestamp: getWIBDateTime(),
  });
  try {
    const kode_cabang = req.session.kode_cabang;
    const status = req.query.status || '';
    const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
    console.log("Filter parameters:", { status, order, kode_cabang });

    let query = `
      WITH RankedOrders AS (
        SELECT o.id_pembeli, MIN(o.id_order) as id_order, c.nama_cust, c.telepon,
               GROUP_CONCAT(o.note) as notes, GROUP_CONCAT(m.menu) as menus,
               GROUP_CONCAT(o.status_order) as statuses, GROUP_CONCAT(m.harga) as harga_menu,
               MIN(o.created_at) as created_at,
               ROW_NUMBER() OVER (ORDER BY MIN(o.created_at) ${order}) as row_num
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

    query += `
        GROUP BY o.id_pembeli
      )
      SELECT id_pembeli, id_order, created_at, nama_cust, telepon,
             notes, statuses, menus, harga_menu,
             ${order === 'ASC' ? 'row_num' : '(SELECT COUNT(*) FROM RankedOrders) - row_num + 1'} as row_num
      FROM RankedOrders
      ORDER BY created_at ${order};
    `;

    const stmt = db.prepare(query);
    const orders = stmt.all(...params);
    console.log("Orders retrieved from DB:", orders);
    orders.forEach((order, index) => {
      console.log(`Order ${index + 1} created_at:`, order.created_at);
    });

    const totalOrders = orders.length;
    console.log("Total orders for cabang:", totalOrders);

    const formattedOrders = orders.map((order) => {
      const noteArray = order.notes.split(',');
      const menuArray = order.menus.split(',');
      const statusArray = order.statuses.split(',');
      const hargaArray = order.harga_menu.split(',').map(Number);

      console.log("Processing order:", {
        id_pembeli: order.id_pembeli,
        menus: menuArray,
        notes: noteArray,
        statuses: statusArray,
        harga_menu: hargaArray,
      });

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

        const menuName = menuArray[i]?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
        console.log("Menu item:", { menu: menuName, quantity, index: i, harga_menu: hargaArray[i] });

        let harga = 0;
        switch (menuName) {
          case 'cimol mozzarella kecil':
            harga = quantity * 11000;
            break;
          case 'cimol mozzarella besar':
            harga = quantity * 22000;
            break;
          case 'cimol bojot kecil':
            harga = quantity * 6000;
            break;
          case 'cimol bojot besar':
            harga = quantity * 12000;
            break;
          case 'cimol ayam kecil':
            harga = quantity * 11000;
            break;
          case 'cimol ayam besar':
            harga = quantity * 22000;
            break;
          case 'cimol beef kecil':
            harga = quantity * 11000;
            break;
          case 'cimol beef besar':
            harga = quantity * 22000;
            break;
          default:
            harga = hargaArray[i] ? quantity * hargaArray[i] : 0;
            console.warn(`Unknown menu: ${menuName}, using harga_menu: ${hargaArray[i]}`);
        }

        return {
          menu: menuArray[i],
          quantity,
          bumbu,
          topping,
          level,
          catatan,
          harga,
        };
      });

      const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const totalHarga = items.reduce((sum, item) => sum + (item.harga || 0), 0);

      const status = statusArray[0] === 'pending' ? 'Menunggu' :
        statusArray[0] === 'confirmed' ? 'Diterima' :
          statusArray[0] === 'completed' ? 'Selesai' : 'Tidak Diketahui';

      console.log("Order formatted:", {
        id_pembeli: order.id_pembeli,
        no: order.row_num,
        nama_cust: order.nama_cust,
        telepon: order.telepon,
        created_at: order.created_at,
        status,
        totalQuantity,
        totalHarga,
        items,
      });

      return {
        id_order: order.id_order,
        id_pembeli: order.id_pembeli,
        no: order.row_num,
        nama: order.nama_cust,
        telepon: order.telepon,
        items,
        totalQuantity,
        totalHarga,
        status,
        catatan: items[0]?.catatan || '-',
        created_at: order.created_at,
      };
    });

    console.log("Formatted orders sent:", formattedOrders);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json(formattedOrders);
  } catch (err) {
    console.error("Error in GET /api/orders:", err.message, err.stack);
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

      const checkStmt = db.prepare("SELECT id_pembeli FROM order_tbl WHERE id_order = ?");
      const order = checkStmt.get(id);
      console.log("Order check result:", order);
      if (!order) {
        console.log("Order not found:", id);
        return res.status(404).json({ error: "Pesanan tidak ditemukan" });
      }

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

app.delete("/api/orders/pembeli/:id_pembeli", requireLogin, async (req, res) => {
  console.log("DELETE /api/orders/pembeli/:id_pembeli called", {
    id_pembeli: req.params.id_pembeli,
    kode_cabang: req.session.kode_cabang,
    timestamp: getWIBDateTime(),
  });
  try {
    const id_pembeli = parseInt(req.params.id_pembeli);
    const kode_cabang = req.session.kode_cabang;

    const checkStmt = db.prepare(`
      SELECT o.id_pembeli
      FROM order_tbl o
      JOIN cabang_tbl cb ON o.id_cabang = cb.id_cabang
      WHERE o.id_pembeli = ? AND cb.kode_cabang = ?
    `);
    const pembeliExists = checkStmt.get(id_pembeli, kode_cabang);

    if (!pembeliExists) {
      console.log("Pembeli not found or unauthorized", { id_pembeli, kode_cabang });
      return res.status(404).json({ error: "Pesanan pelanggan tidak ditemukan atau tidak diizinkan" });
    }

    const deleteStmt = db.prepare(`DELETE FROM order_tbl WHERE id_pembeli = ?`);
    const result = deleteStmt.run(id_pembeli);

    if (result.changes === 0) {
      console.log("No orders deleted for pembeli", { id_pembeli });
      return res.status(500).json({ error: "Gagal menghapus pesanan" });
    }

    const deleteCustomerStmt = db.prepare(`DELETE FROM customer_tbl WHERE id_pembeli = ?`);
    deleteCustomerStmt.run(id_pembeli);

    console.log("Semua pesanan pelanggan dihapus", { id_pembeli, changes: result.changes });
    res.status(200).json({ message: "Semua pesanan pelanggan berhasil dihapus" });
  } catch (err) {
    console.error("Error in DELETE /api/orders/pembeli/:id_pembeli:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});