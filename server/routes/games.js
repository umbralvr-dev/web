const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/games — biblioteca de juegos activa, ordenada para la grilla.
router.get('/', (_req, res) => {
  const games = db
    .prepare(
      `SELECT id, title, tag, cover_url, featured
       FROM games WHERE active = 1
       ORDER BY featured DESC, sort_order ASC`
    )
    .all();
  res.json({ games });
});

module.exports = router;
