// config/database.js
import Database from "better-sqlite3";

const db = new Database("./cimol.db");
db.exec("PRAGMA journal_mode=WAL;");

export default db;