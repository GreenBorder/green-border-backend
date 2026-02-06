const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

/**
 * Transport SMTP simple
 * Variables attendues :
 * SMTP_HOST
 * SMTP_PORT
 * SMTP_USER
 * SMTP_PASS
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * POST /enterprise/contact
 * Réception formulaire Enterprise + notification email
 */
router.post('/contact', async (req, res) => {
  const { name, company, email, message } = req.body;

  if (!name || !company || !email || !message) {
    return res.status(400).json({
      status: 'error',
      message: 'Champs manquants'
    });
  }

  try {
    await transporter.sendMail({
      from: `"Green-Border" <${process.env.SMTP_USER}>`,
      to: 'societe.triada@gmail.com',
      replyTo: email,
      subject: '[Green-Border] Nouvelle demande Enterprise',
      text:
        `Nom : ${name}\n` +
        `Société : ${company}\n` +
        `Email : ${email}\n\n` +
        `Message :\n${message}`
    });

    return res.status(200).json({
      message: 'Votre demande a bien été transmise.'
    });

  } catch (error) {
    console.error('Enterprise email error:', error);

    return res.status(500).json({
      status: 'error',
      message: 'Erreur interne serveur'
    });
  }
});

module.exports = router;
