function success(res, data, meta, status = 200) {
  const response = { success: true, data };
  if (meta) response.meta = meta;
  return res.status(status).json(response);
}

function error(res, code, message, status = 400, fields) {
  const err = { code, message };
  if (fields) err.fields = fields;
  return res.status(status).json({ success: false, error: err });
}

module.exports = { success, error };
