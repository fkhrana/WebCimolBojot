// meriksa apakah suda login sebagai admin
export function requireLogin(req, res, next) {
    console.log("Checking session:", req.session);
    if (!req.session.adminId) { // kalo ga ada, berarti belom login
        console.log("Session invalid, redirecting to /admin-login");
        res.setHeader("HX-Redirect", "/admin-login"); // redirect ke halaman login tanpa reload penuh (asinkronus) (headernya ga dimuat ulang lagi gitu, cuma isi form login)


        return res.status(401).send(); //401 (unauthorized)
    }
    console.log("Session valid, proceeding...");
    next();
}