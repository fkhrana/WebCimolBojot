import Database from "better-sqlite3"; // kelola database sqlite3

const db = new Database("./cimol.db"); // koneksi ke cimol.db
db.exec("PRAGMA journal_mode=WAL;"); // WAL: write ahead loggin jadi db nya lebih cepet buat baca/tulis bersamaan(?)

export default db;