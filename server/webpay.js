// Integración con Transbank Webpay Plus usando el SDK oficial.
// Documentación: https://www.transbankdevelopers.cl/producto/webpay
//
// Por defecto corre en modo INTEGRACIÓN (pruebas), que usa credenciales
// públicas de prueba entregadas por el propio SDK — no es necesario
// tener un comercio real afiliado para probar todo el flujo.
//
// Para ir a producción real necesitas:
//   1. Afiliarte como comercio en Transbank (transbankdevelopers.cl)
//   2. Obtener tu CommerceCode y ApiKey reales
//   3. Setear TBK_ENV=production y esas credenciales en tu .env
//   4. Tu backend debe correr bajo HTTPS (Transbank lo exige)

const { WebpayPlus, Options, IntegrationCommerceCodes, IntegrationApiKeys, Environment } = require('transbank-sdk');
const cfg = require('./config');

function getWebpayInstance() {
  let options;

  if (cfg.TBK_ENV === 'production') {
    if (!cfg.TBK_COMMERCE_CODE || !cfg.TBK_API_KEY) {
      throw new Error(
        'TBK_ENV=production pero faltan TBK_COMMERCE_CODE / TBK_API_KEY en el .env'
      );
    }
    options = new Options(cfg.TBK_COMMERCE_CODE, cfg.TBK_API_KEY, Environment.Production);
  } else {
    // Ambiente de integración/pruebas oficial de Transbank.
    options = new Options(
      IntegrationCommerceCodes.WEBPAY_PLUS,
      IntegrationApiKeys.WEBPAY,
      Environment.Integration
    );
  }

  return new WebpayPlus.Transaction(options);
}

/**
 * Crea una transacción en Transbank y devuelve { url, token } para que
 * el frontend redirija al usuario a pagar.
 */
async function createTransaction({ buyOrder, sessionId, amount, returnUrl }) {
  const tx = getWebpayInstance();
  const response = await tx.create(buyOrder, sessionId, amount, returnUrl);
  return response; // { token, url }
}

/**
 * Confirma ("commit") una transacción luego de que Transbank redirige
 * de vuelta al backend. Devuelve el detalle con el resultado del pago.
 */
async function commitTransaction(token) {
  const tx = getWebpayInstance();
  const result = await tx.commit(token);
  return result; // { status, amount, buy_order, authorization_code, response_code, ... }
}

module.exports = { createTransaction, commitTransaction };
