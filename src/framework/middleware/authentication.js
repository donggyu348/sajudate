
export default function isAuthenticated(req, res, next) {
  if (req.session.admin) return next();
  res.redirect("/admin/login");
}