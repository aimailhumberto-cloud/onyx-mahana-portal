function calcCxC(data) {
  const precio = parseFloat(data.precio_ingreso) || 0;
  const costo = parseFloat(data.costo_pago) || 0;
  const comPct = parseFloat(data.comision_pct) || 0;
  const comision = parseFloat(data.monto_comision) || Math.round((precio * comPct / 100) * 100) / 100;
  const ganancia = Math.round((precio - costo - comision) * 100) / 100;
  const subtotal = Math.round((precio - comision) * 100) / 100;
  const itbm = Math.round((subtotal * 0.07) * 100) / 100;
  const total = Math.round((subtotal + itbm) * 100) / 100;
  return {
    monto_comision: comision,
    ganancia_mahana: ganancia,
    cxc_subtotal: subtotal,
    cxc_itbm: itbm,
    cxc_total: total,
  };
}

module.exports = { calcCxC };
