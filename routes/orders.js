// routes/orders.js
import express from "express";
import db from "../config/database.js";
import { requireLogin } from "../middleware/auth.js";
import { getWIBDateTime } from "../utils/helpers.js"; //ngambil waktu WIB

const router = express.Router();

// daftar menu dasar
const menuBase = [
    { type: "mozarella", idBase: 3, name: "Mozzarella Porsi Kecil", priceKecil: 11000, priceBesar: 22000 },
    { type: "bojot", idBase: 1, name: "Bojot Porsi Kecil", priceKecil: 6000, priceBesar: 12000 },
    { type: "ayam", idBase: 5, name: "Ayam Porsi Kecil", priceKecil: 11000, priceBesar: 22000 },
    { type: "beef", idBase: 7, name: "Beef Porsi Kecil", priceKecil: 11000, priceBesar: 22000 },
];

// dirapiin lagi dari menuBase jadi menuItems buat pas proses
const menuItems = menuBase.flatMap(({ type, idBase, name, priceKecil, priceBesar }) => [
    { formName: `cimol_${type}_kecil`, idMenu: idBase, menu: `Cimol ${name}`, price: priceKecil },
    { formName: `cimol_${type}_besar`, idMenu: idBase + 1, menu: `Cimol ${name.replace("Kecil", "Besar")}`, price: priceBesar },
]);

// API buat ambil daftar cabang dari database
router.get("/api/cabang", (req, res) => {
    console.log("GET /api/cabang called");
    try {
        const stmt = db.prepare("SELECT * FROM cabang_tbl");
        const cabang = stmt.all();
        // ngubah data cabang jadi format HTML <option> biar bisa jadi dropdown
        const output = cabang
            .map((element) => `<option value="${element.kode_cabang}">${element.cabang}</option>`)
            .join("");
        res.send(output);
    } catch (err) {
        console.error("Error in /api/cabang:", err.message);
        res.status(500).json({ error: "Database error", details: err.message });
    }
});

// API buat nerima form pesanan
router.post("/form/order", async (req, res) => {
  console.log("POST /form/order received:", req.body);
  try {
    const { nama, telepon, cabang, catatan } = req.body; //ngambil data dari form
    console.log("Extracted form data:", { nama, telepon, cabang, catatan });

    // nomor valid apa engga
    const phoneStr = telepon.toString().trim();
    if (!phoneStr.match(/^08[0-9]{8,11}$/)) {
      console.log("Validation failed: Invalid phone number", phoneStr);
      return res.status(400).json({ error: "Nomor telepon harus diawali 08 dan berisi 10-13 digit" });
    }

    // dah ada /diisi kah nama telpon cabang
    if (!nama || !phoneStr || !cabang) {
      console.log("Validation failed: Missing nama, telepon, or cabang");
      return res.status(400).json({ error: "Nama, telepon, dan cabang wajib diisi" });
    }

    let totalHarga = 0;
    const orderedItems = [];

    // cek menu, ada yang dipesan/gak
    menuItems.forEach((item) => {
      const quantity = parseInt(req.body[item.formName]) || 0;
      console.log(`Processing ${item.formName}: ${quantity}`);
      if (quantity > 0) {
        // setiap jumlah menu, ngambl bumbu topping level
        for (let i = 1; i <= quantity; i++) {
          const bumbu = req.body[`bumbu_${item.formName}_${i}`] || "-";
          const topping = req.body[`topping_${item.formName}_${i}`] || "-";
          const level = req.body[`level_${item.formName}_${i}`] || "-";
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
          });
        }
      }
    });

    console.log("Final orderedItems:", orderedItems);

    // error kalo ga masukin menu samsek
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

    // nyimpen data sementara pake sesi
    req.session.pendingOrder = {
      nama,
      telepon: phoneStr,
      cabang,
      id_cabang: cabangRow.id_cabang,
      items: orderedItems,
      catatan: catatan || "",
      totalHarga,
      created_at: getWIBDateTime(),
    };

    // id sementara sebelum jadi id_order yang masuk ke database
    const tempOrderId = Date.now();
    req.session.pendingOrder.tempOrderId = tempOrderId;

    console.log("Pending order saved to session:", req.session.pendingOrder);

    // redirect ke detailorder pake htmx
    res.setHeader("HX-Redirect", `/detailorder?orderId=${tempOrderId}`);
    res.status(200).send();
  } catch (err) {
    console.error("Error in POST /form/order:", err.message);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// API buat ambil ambil detail pesanan sesuai ID
router.get("/api/orders/:id", async (req, res) => {
  console.log("GET /api/orders/:id called:", req.params.id);
  try {
    const orderId = req.params.id;

    // ngecek data di sesi ada apa engga
    if (req.session.pendingOrder && req.session.pendingOrder.tempOrderId == orderId) {
      const order = req.session.pendingOrder;
      const cabangStmt = db.prepare("SELECT cabang FROM cabang_tbl WHERE id_cabang = ?");
      const cabang = cabangStmt.get(order.id_cabang);

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

      // format pesanan untuk dikirim
      const response = {
        nama: order.nama,
        telepon: order.telepon,
        cabang: cabang ? cabang.cabang : "Tidak Diketahui",
        kode_cabang: order.id_cabang,
        items: order.items.map(item => ({
          name: item.menu,
          quantity: item.quantity || 1,
          harga: item.price,
          bumbu: item.bumbu || "-",
          topping: item.topping || "-",
          level: item.level || "-",
          catatan: order.catatan || "-", // Gunakan catatan dari sesi tanpa prefiks
          foto: menuFotoMap[item.menu] || "/cimolmoza.png",
        })),
        totalHarga: order.totalHarga,
      };
      console.log("Response from session:", response);
      return res.json(response);
    }

    // kalo ga ada datanya di sesi, dia nyoba nyari di database
    const orderStmt = db.prepare(`
      SELECT o.*, c.telepon, cb.cabang, cb.kode_cabang
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

    // ngambil semua item dengan created_at yang sama (pesanannya dijadiin satu kategori make created_at)
    const itemsStmt = db.prepare(`
      SELECT o.note, m.menu, m.harga, m.foto
      FROM order_tbl o
      JOIN menu_tbl m ON o.id_menu = m.id_menu
      WHERE o.id_pembeli = ? AND o.created_at = ?
    `);
    const items = itemsStmt.all(order.id_pembeli, order.created_at);
    console.log("Items fetched:", items);

    // proses item untuk ngambil detail
    let totalHarga = 0;
    let namaPelanggan = "-";
    const customerStmt = db.prepare("SELECT nama_cust FROM customer_tbl WHERE id_pembeli = ?");
    const customer = customerStmt.get(order.id_pembeli);
    const formattedItems = items.map((item) => {
      const noteLines = item.note.split('\n');
      const namaMatch = noteLines.find(line => line.startsWith('Nama:'));
      if (namaMatch) {
        namaPelanggan = namaMatch.replace('Nama:', '').trim();
      } else if (customer) {
        namaPelanggan = customer.nama_cust;
      }
      const quantityMatch = noteLines.find(line => line.startsWith('Quantity:'));
      const quantity = quantityMatch ? parseInt(quantityMatch.replace('Quantity:', '')) : 1;
      const bumbu = noteLines.find(line => line.startsWith('Bumbu:'))?.replace('Bumbu:', '').trim() || '-';
      const topping = noteLines.find(line => line.startsWith('Topping:'))?.replace('Topping:', '').trim() || '-';
      const level = noteLines.find(line => line.startsWith('Level:'))?.replace('Level:', '').trim() || '-';
      const catatanMatch = noteLines.find(line => line.startsWith('Catatan:'));
      const catatan = catatanMatch ? catatanMatch.replace('Catatan:', '').trim() : '-';

      totalHarga += quantity * item.harga;

      return {
        name: item.menu,
        quantity,
        harga: item.harga,
        bumbu,
        topping,
        level,
        catatan,
        photo: item.foto || "/cimolmoza.png",
      };
    });

    const response = {
      nama: namaPelanggan,
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

// API untuk konfirmasi pesanan
router.post("/api/orders/confirm", async (req, res) => {
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

    const { nama, telepon, id_cabang, items, catatan } = req.session.pendingOrder;
    const created_at = getWIBDateTime();
    console.log("Order data from session:", { nama, telepon, id_cabang, items, catatan, created_at });

    const normalizedTelepon = telepon.trim();

    // ngecek pelanggan dengan telepon dan nama yang sama
    const checkCustomerStmt = db.prepare("SELECT id_pembeli FROM customer_tbl WHERE telepon = ? AND nama_cust = ?");
    const existingCustomer = checkCustomerStmt.get(normalizedTelepon, nama);
    let id_pembeli;

    if (existingCustomer) {
      id_pembeli = existingCustomer.id_pembeli;
      console.log("Existing customer found:", { id_pembeli, telepon: normalizedTelepon, nama });
    } else {
      const customerStmt = db.prepare("INSERT INTO customer_tbl (nama_cust, telepon) VALUES (?, ?)");
      const customerResult = customerStmt.run(nama, normalizedTelepon);
      id_pembeli = customerResult.lastInsertRowid;
      console.log("New customer saved:", { id_pembeli, nama, telepon: normalizedTelepon });
    }

    // validasi cabang
    const cabangStmt = db.prepare("SELECT id_cabang FROM cabang_tbl WHERE id_cabang = ?");
    const cabangRow = cabangStmt.get(id_cabang);
    if (!cabangRow) {
      console.log("Invalid id_cabang:", id_cabang);
      return res.status(400).json({ error: "Cabang tidak valid" });
    }

    // nyimpen pesanan ke order_tbl (satu baris per item di database)
    let firstOrderId = null;
    const orderStmt = db.prepare(
      "INSERT INTO order_tbl (id_pembeli, id_menu, id_cabang, note, status_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );

    for (const item of items) {
      // validasi menu
      const menuStmt = db.prepare("SELECT id_menu FROM menu_tbl WHERE menu = ?");
      const menu = menuStmt.get(item.menu);
      if (!menu) {
        console.log("Invalid menu:", item.menu);
        return res.status(400).json({ error: `Menu ${item.menu} tidak valid` });
      }

      // buat note untuk item, termasuk nama pelanggan dan catatan
      const note = [
        `Nama: ${nama}`,
        catatan ? `Catatan: ${catatan}` : '',
        `Bumbu: ${item.bumbu || '-'}`,
        `Topping: ${item.topping || '-'}`,
        `Level: ${item.level || '-'}`,
        `Quantity: ${item.quantity || 1}`
      ].filter(Boolean).join('\n');

      const result = orderStmt.run(
        id_pembeli,
        menu.id_menu,
        id_cabang,
        note,
        "pending",
        created_at
      );
      if (!firstOrderId) {
        firstOrderId = result.lastInsertRowid;
      }
      console.log("Order item saved:", { id_order: result.lastInsertRowid, id_menu: menu.id_menu, note });
    }

    // Hapus sesi
    delete req.session.pendingOrder;
    console.log("Pending order cleared from session");

    // Redirect ke detailorder
    res.setHeader("HX-Redirect", `/detailorder?orderId=${firstOrderId}`);
    res.status(200).json({ success: true, message: "Pesanan telah dikirim!", id_order: firstOrderId });
  } catch (err) {
    console.error("Error in POST /api/orders/confirm:", err.message, err.stack);
    res.status(500).json({ error: "Kesalahan server", details: err.message });
  }
});

// API buat ngambil pesanan ke admin
router.post("/api/orders/cancel", async (req, res) => {
    console.log("POST /api/orders/cancel received:", req.body);
    try {
        const { orderId } = req.body;
        if (!orderId || !req.session.pendingOrder || req.session.pendingOrder.tempOrderId != orderId) {
            console.log("No pending order to cancel:", orderId);
            return res.status(404).json({ error: "Pesanan sementara tidak ditemukan" });
        }

        delete req.session.pendingOrder;
        console.log("Pending order cancelled and cleared from session");

        res.setHeader('HX-Redirect', '/order');
        res.status(200).send();
    } catch (err) {
        console.error("Error in POST /api/orders/cancel:", err.message);
        res.status(500).json({ error: "Kesalahan server", details: err.message });
    }
});

router.get("/api/orders", requireLogin, async (req, res) => {
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
        SELECT o.id_pembeli, MIN(o.id_order) as id_order, c.telepon,
               GROUP_CONCAT(o.note) as notes, GROUP_CONCAT(m.menu) as menus,
               GROUP_CONCAT(o.status_order) as statuses, GROUP_CONCAT(m.harga) as harga_menu,
               o.created_at,
               ROW_NUMBER() OVER (ORDER BY o.created_at ${order}) as row_num
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
        GROUP BY o.id_pembeli, o.created_at
      )
      SELECT id_pembeli, id_order, created_at, telepon,
             notes, statuses, menus, harga_menu,
             ${order === 'ASC' ? 'row_num' : '(SELECT COUNT(*) FROM RankedOrders) - row_num + 1'} as row_num
      FROM RankedOrders
      ORDER BY created_at ${order};
    `;

    const stmt = db.prepare(query);
    const orders = stmt.all(...params);
    console.log("Orders retrieved from DB:", orders);

    const formattedOrders = orders.map((order) => {
      const noteArray = order.notes.split(',');
      const menuArray = order.menus.split(',');
      const statusArray = order.statuses.split(',');
      const hargaArray = order.harga_menu.split(',').map(Number);

      console.log("Processing order:", {
        id_pembeli: order.id_pembeli,
        created_at: order.created_at,
        menus: menuArray,
        notes: noteArray,
        statuses: statusArray,
        harga_menu: hargaArray,
      });

      let namaPelanggan = "-";
      const customerStmt = db.prepare("SELECT nama_cust FROM customer_tbl WHERE id_pembeli = ?");
      const customer = customerStmt.get(order.id_pembeli);
      const items = noteArray.map((note, i) => {
        const noteLines = note.split('\n');
        const namaMatch = noteLines.find((line) => line.startsWith('Nama:'));
        if (namaMatch) {
          namaPelanggan = namaMatch.replace('Nama:', '').trim();
        } else if (customer) {
          namaPelanggan = customer.nama_cust;
        }
        const quantityMatch = noteLines.find((line) => line.startsWith('Quantity:'));
        const quantity = quantityMatch ? parseInt(quantityMatch.replace('Quantity:', '')) : 1;
        const bumbu = noteLines.find((line) => line.startsWith('Bumbu:'))?.replace('Bumbu:', '').trim() || '-';
        const topping = noteLines.find((line) => line.startsWith('Topping:'))?.replace('Topping:', '').trim() || '-';
        const level = noteLines.find((line) => line.startsWith('Level:'))?.replace('Level:', '').trim() || '-';
        const catatanMatch = noteLines.find((line) => line.startsWith('Catatan:'));
        const catatan = catatanMatch ? catatanMatch.replace('Catatan:', '').trim() : '-';

        let harga = hargaArray[i] ? quantity * hargaArray[i] : 0;

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

      return {
        id_order: order.id_order,
        id_pembeli: order.id_pembeli,
        no: order.row_num,
        nama: namaPelanggan,
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

// ngubah status pesanan di admin
router.post("/api/orders/:id/status", requireLogin, async (req, res) => {
  console.log("POST /api/orders/:id/status called:", {
    orderId: req.params.id,
    status: req.body.status,
    kode_cabang: req.session.kode_cabang,
    timestamp: getWIBDateTime(),
  });
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    if (!['pending', 'confirmed', 'completed'].includes(status)) {
      console.log("Invalid status:", status);
      return res.status(400).json({ error: "Status tidak valid" });
    }

    // ambil id_pembeli dan created_at dari orderId
    const orderStmt = db.prepare(`
      SELECT id_pembeli, created_at
      FROM order_tbl
      WHERE id_order = ? AND id_cabang IN (
        SELECT id_cabang FROM cabang_tbl WHERE kode_cabang = ?
      )
    `);
    const order = orderStmt.get(orderId, req.session.kode_cabang);
    if (!order) {
      console.log("Order not found or unauthorized:", { orderId, kode_cabang: req.session.kode_cabang });
      return res.status(404).json({ error: "Pesanan tidak ditemukan atau tidak diizinkan" });
    }

    // perbarui semua item dengan id_pembeli dan created_at yang sama
    const updateStmt = db.prepare(`
      UPDATE order_tbl
      SET status_order = ?
      WHERE id_pembeli = ? AND created_at = ?
    `);
    const result = updateStmt.run(status, order.id_pembeli, order.created_at);
    if (result.changes === 0) {
      console.log("No orders updated:", { orderId, id_pembeli: order.id_pembeli, created_at: order.created_at });
      return res.status(404).json({ error: "Gagal memperbarui status pesanan" });
    }

    console.log("Status updated successfully:", { orderId, status, changes: result.changes });
    res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/orders/:id/status:", err.message);
    res.status(500).json({ error: "Kesalahan server", details: err.message });
  }
});

// API untuk hapus pesana di admin
router.delete("/api/orders/pembeli/:id_pembeli", requireLogin, async (req, res) => {
    console.log("DELETE /api/orders/pembeli/:id_pembeli called", {
        id_pembeli: req.params.id_pembeli,
        created_at: req.query.created_at,
        kode_cabang: req.session.kode_cabang,
        timestamp: getWIBDateTime(),
    });
    try {
        const id_pembeli = parseInt(req.params.id_pembeli);
        const created_at = req.query.created_at;
        const kode_cabang = req.session.kode_cabang;

        if (isNaN(id_pembeli)) {
            console.log("Invalid id_pembeli:", req.params.id_pembeli);
            return res.status(400).json({ error: "ID pelanggan tidak valid" });
        }

        if (!created_at) {
            console.log("Missing created_at in query");
            return res.status(400).json({ error: "Parameter created_at diperlukan" });
        }

        // periksa apakah pesanan ada
        const checkStmt = db.prepare(`
      SELECT o.id_pembeli
      FROM order_tbl o
      JOIN cabang_tbl cb ON o.id_cabang = cb.id_cabang
      WHERE o.id_pembeli = ? AND o.created_at = ? AND cb.kode_cabang = ?
    `);
        const orderExists = checkStmt.get(id_pembeli, created_at, kode_cabang);

        if (!orderExists) {
            console.log("Order not found or unauthorized", { id_pembeli, created_at, kode_cabang });
            return res.status(404).json({ error: "Pesanan tidak ditemukan atau tidak diizinkan" });
        }

        // hapus pesanan spesifik
        const deleteStmt = db.prepare(`
      DELETE FROM order_tbl
      WHERE id_pembeli = ? AND created_at = ?
    `);
        const result = deleteStmt.run(id_pembeli, created_at);

        if (result.changes === 0) {
            console.log("No orders deleted", { id_pembeli, created_at });
            return res.status(404).json({ error: "Gagal menghapus pesanan" });
        }

        console.log("Order deleted successfully", { id_pembeli, created_at, changes: result.changes });
        res.status(200).json({ message: "Pesanan berhasil dihapus" });
    } catch (err) {
        console.error("Error in DELETE /api/orders/pembeli/:id_pembeli:", err.message);
        res.status(500).json({ error: "Kesalahan server", details: err.message });
    }
});

export default router;