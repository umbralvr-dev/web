// Carga inicial de la biblioteca de juegos. Se puede correr manualmente
// con `npm run seed`, o se ejecuta automáticamente al iniciar el server
// si la tabla `games` está vacía (ver server.js).
const db = require('./index');

const GAMES = [
  {
    id: 'spatial',
    title: 'Spatial Ops',
    tag: 'PVP · FREE ROAM',
    cover_url: 'assets/games/spatial-ops-cover.jpg',
    featured: 1,
    sort_order: 0
  },
  {
    id: 'zombies',
    title: 'Misión Zombies',
    tag: 'CO-OP · ACCIÓN',
    cover_url: 'assets/games/zombies-cover.jpg',
    featured: 0,
    sort_order: 1
  },
  {
    id: 'insanity',
    title: 'Insanity : The Haunting',
    tag: 'CO-OP · HORROR',
    cover_url: 'assets/games/mansion-cover.jpg',
    featured: 0,
    sort_order: 2
  },
  {
    id: 'party',
    title: 'Party Playland',
    tag: 'MULTIJUGADOR',
    cover_url: 'assets/games/party-cover.jpg',
    featured: 0,
    sort_order: 3
  },
  {
    id: 'kraken',
    title: 'Kraken Island',
    tag: 'MULTIJUGADOR',
    cover_url: 'assets/games/kraken-cover.jpg',
    featured: 0,
    sort_order: 4
  },
  {
    id: 'death',
    title: 'Death Squad',
    tag: 'AVENTURA · CO-OP',
    cover_url: 'assets/games/squad-cover.jpg',
    featured: 0,
    sort_order: 5
  }
];

function seed() {
  const insert = db.prepare(`
    INSERT INTO games (id, title, tag, cover_url, featured, active, sort_order)
    VALUES (@id, @title, @tag, @cover_url, @featured, 1, @sort_order)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, tag=excluded.tag, cover_url=excluded.cover_url,
      featured=excluded.featured, sort_order=excluded.sort_order
  `);
  const tx = db.transaction((games) => {
    for (const g of games) insert.run(g);
  });
  tx(GAMES);
  console.log(`Biblioteca de juegos cargada (${GAMES.length} juegos).`);
}

if (require.main === module) {
  seed();
  process.exit(0);
}

module.exports = seed;
