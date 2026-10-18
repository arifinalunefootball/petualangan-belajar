/* Adaptor QR: window.QR.encode(teks) -> matriks boolean */
window.QR = (function () {
  function encode(text) {
    if (typeof qrcode !== 'function') throw new Error('lib qr tidak ada');
    const qr = qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    const n = qr.getModuleCount();
    const m = [];
    for (let y = 0; y < n; y++) {
      const row = [];
      for (let x = 0; x < n; x++) row.push(qr.isDark(y, x) ? 1 : 0);
      m.push(row);
    }
    return m;
  }
  return { encode };
})();
