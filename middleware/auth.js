// middleware/auth.js
export function requireLogin(req, res, next) {
    console.log("Checking session:", req.session);
    if (!req.session.adminId) {
        console.log("Session invalid, redirecting to /admin-login");
        res.setHeader("HX-Redirect", "/admin-login");
        return res.status(401).send();
    }
    console.log("Session valid, proceeding...");
    next();
}