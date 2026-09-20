const crypto = require('node:crypto');
const { fail } = require('../lib/helpers');
function csrf(req, res, next) {
  if (!req.session.csrf)
    req.session.csrf = crypto.randomBytes(32).toString('hex');
  res.locals.csrf = req.session.csrf;
  if (
    req.method === 'POST' &&
    (typeof req.body._csrf !== 'string' || req.body._csrf !== req.session.csrf)
  ) {
    return fail(
      res,
      403,
      'Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang và thử lại.',
    );
  }
  next();
}
// Giới hạn đơn giản theo IP; phù hợp một tiến trình demo, không cần bảng thứ tư.
function rateLimit(max, windowMs) {
  const attempts = new Map();
  const timer = setInterval(() => {
    for (const [key, entry] of attempts)
      if (entry.until < Date.now()) attempts.delete(key);
  }, windowMs);
  timer.unref();
  return (req, res, next) => {
    let entry = attempts.get(req.ip);
    if (!entry || entry.until < Date.now())
      entry = { count: 0, until: Date.now() + windowMs };
    attempts.set(req.ip, entry);
    if (++entry.count > max)
      return fail(
        res,
        429,
        'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau vài phút.',
      );
    next();
  };
}
module.exports = { csrf, rateLimit };
