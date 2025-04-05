require('dotenv').config();
const express = require('express');
const app = express();
const multer = require('multer');
const methodOverride = require('method-override');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

const isProduction = process.env.NODE_ENV === 'production';
const db = isProduction
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'exercise',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 5432,
    });

app.set('view engine', 'ejs');

// HOMEPAGE
app.get('/', (req, res) => {
  res.render('index');
});

// ==================== ROTTE ESERCIZI ====================

// Mostra tutti gli esercizi
app.get('/exercises', async (req, res) => {
  try {
    const { rows: exercises } = await db.query('SELECT * FROM exercises');
    const { rows: workouts } = await db.query('SELECT * FROM workouts ORDER BY name');
    res.render('exercises', { exercises, workouts });
  } catch (err) {
    res.send('Errore nel recupero esercizi');
  }
});

// Pagina dettaglio esercizio
app.get('/exercises/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [req.params.id]);
    const exercise = rows[0];
    if (!exercise) return res.status(404).send('Esercizio non trovato.');

    exercise.equipment = JSON.parse(exercise.equipment || '[]');
    exercise.exercise_type = JSON.parse(exercise.exercise_type || '[]');
    exercise.position = JSON.parse(exercise.position || '[]');
    exercise.muscle_group = JSON.parse(exercise.muscle_group || '[]');
    exercise.images = JSON.parse(exercise.images || '[]');

    res.render('exercise_detail', { exercise });
  } catch (err) {
    res.send('Errore nel caricamento dettagli esercizio');
  }
});

// Crea esercizio
app.post('/exercises', upload.array('images', 10), async (req, res) => {
  try {
    const { name, complexity, description, equipment, exercise_type, position, muscle_group } = req.body;
    const images = req.files.map(f => '/uploads/' + f.filename);

    await db.query(
      `INSERT INTO exercises (name, complexity, description, equipment, exercise_type, position, muscle_group, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        name,
        complexity,
        description,
        JSON.stringify([].concat(equipment || [])),
        JSON.stringify([].concat(exercise_type || [])),
        JSON.stringify([].concat(position || [])),
        JSON.stringify([].concat(muscle_group || [])),
        JSON.stringify(images),
      ]
    );

    res.redirect('/exercises');
  } catch (err) {
    console.error('Errore nel salvataggio esercizio:', err);
    res.send('Errore nel salvataggio esercizio');
  }
});

// Modifica esercizio
app.get('/exercises/:id/edit', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [req.params.id]);
    const exercise = rows[0];
    if (!exercise) return res.send('Esercizio non trovato.');
    res.render('edit_exercise', { exercise });
  } catch {
    res.send('Errore');
  }
});

app.put('/exercises/:id', upload.array('images', 10), async (req, res) => {
  try {
    const { name, complexity, description } = req.body;
    const equipment = JSON.stringify([].concat(req.body.equipment || []));
    const exercise_type = JSON.stringify([].concat(req.body.exercise_type || []));
    const position = JSON.stringify([].concat(req.body.position || []));
    const muscle_group = JSON.stringify([].concat(req.body.muscle_group || []));
    const images = req.files.length ? JSON.stringify(req.files.map(f => '/uploads/' + f.filename)) : null;

    let query = `
      UPDATE exercises SET name = $1, complexity = $2, description = $3,
      equipment = $4, exercise_type = $5, position = $6, muscle_group = $7
    `;
    const values = [name, complexity, description, equipment, exercise_type, position, muscle_group];

    if (images) {
      query += `, images = $8 WHERE id = $9`;
      values.push(images, req.params.id);
    } else {
      query += ` WHERE id = $8`;
      values.push(req.params.id);
    }

    await db.query(query, values);
    res.redirect('/exercises/' + req.params.id);
  } catch {
    res.send('Errore nella modifica');
  }
});

app.delete('/exercises/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM exercises WHERE id = $1', [req.params.id]);
    res.redirect('/exercises');
  } catch {
    res.send('Errore nella cancellazione');
  }
});

// ==================== ROTTE WORKOUT ====================

app.get('/workouts', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM workouts');
  res.render('workouts', { workouts: rows });
});

app.get('/workouts/new', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM exercises');
  res.render('new_workout', { exercises: rows });
});

app.post('/workouts', async (req, res) => {
  const { name, category, equipment, muscle_group, exercise_type, position } = req.body;

  const values = [
    name,
    category,
    JSON.stringify([].concat(equipment || [])),
    JSON.stringify([].concat(muscle_group || [])),
    JSON.stringify([].concat(exercise_type || [])),
    JSON.stringify([].concat(position || [])),
  ];

  await db.query(
    `INSERT INTO workouts (name, category, equipment, muscle_group, exercise_type, position)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    values
  );

  res.redirect('/workouts/category/' + category);
});

app.get('/workouts/category/:slug', async (req, res) => {
  const { slug } = req.params;
  const sort = req.query.sort || 'name';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const allowed = ['name', 'category', 'equipment', 'muscle_group', 'exercise_type', 'position'];
  const sortColumn = allowed.includes(sort) ? sort : 'name';

  const { rows } = await db.query(
    `SELECT * FROM workouts WHERE category = $1 ORDER BY ${sortColumn} COLLATE NOCASE ${order}`,
    [slug]
  );
  res.render('workouts_by_category', {
    workouts: rows,
    category: slug,
    sort,
    order,
  });
});

app.get('/workouts/:id', async (req, res) => {
  const id = req.params.id;
  const { rows } = await db.query('SELECT * FROM workouts WHERE id = $1', [id]);
  const workout = rows[0];
  if (!workout) return res.status(404).send('Workout non trovato.');

  const { rows: exercises } = await db.query(
    `SELECT e.* FROM exercises e
     INNER JOIN workout_exercises we ON e.id = we.exercise_id
     WHERE we.workout_id = $1`,
    [id]
  );

  res.render('workout_detail', { workout, exercises });
});

// AVVIO
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server avviato su http://localhost:' + PORT);
});
