require('dotenv').config();

const enviarCorreo = async ({ to, subject, html }) => {
  const respuesta = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_FROM, name: "UTVentas" },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Brevo API error ${respuesta.status}: ${detalle}`);
  }

  return respuesta.json();
};

module.exports = { enviarCorreo };
