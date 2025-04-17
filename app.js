const express = require('express');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

console.log("✅ DATABASE_URL:", process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = {
  all: (query, params, callback) => pool.query(query, params)
    .then(result => callback(null, result.rows))
    .catch(err => callback(err)),
    
  get: (query, params, callback) => pool.query(query, params)
    .then(result => callback(null, result.rows[0]))
    .catch(err => callback(err)),

  run: (query, params, callback) => pool.query(query, params)
    .then(() => callback(null))
    .catch(err => callback(err))
};

const methodOverride = require('method-override');
const multer = require('multer');
const fs = require('fs');

const app = express();
const db = require('./db');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Homepage
app.get('/', (req, res) => {
  res.render('home');
});


// Multer per immagini multiple
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ========== ROTTE ESERCIZI ==========

const muscleGroups = [
  'Abductors', 'Abs', 'Adductors', 'Biceps', 'Calves', 'Chest', 'Forearms',
  'Glutes', 'Hamstring', 'Hip Flexors', 'Lats', 'Lower Back',
  'Obliques', 'Quads', 'Shoulders', 'Traps', 'Triceps', 'Upper Back'
];

// Pagina esercizi
app.get('/exercises', (req, res) => {
  res.render('exercises', { groups: muscleGroups });
});

// Pagina nuovo esercizio
app.get('/exercises/add', (req, res) => {
  res.render('add_exercise');
});

app.get('/exercises/search', (req, res) => {
  const { equipment, complexity, type, position, muscle_group } = req.query;

  let query = 'SELECT * FROM exercises';
  let conditions = [];
  let params = [];

  if (equipment) {
    conditions.push("type_of_exercise LIKE ?");
    params.push(`%${equipment}%`);
  }

  if (complexity) {
    conditions.push("complexity = ?");
    params.push(complexity);
  }

  if (type) {
    conditions.push("exercise_type LIKE ?");
    params.push(`%${type}%`);
  }

  if (position) {
    conditions.push("position LIKE ?");
    params.push(`%${position}%`);
  }

  if (muscle_group) {
    conditions.push("muscle_group LIKE ?");
    params.push(`%${muscle_group}%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.send('Errore nella ricerca.');
    }

    if (!rows || rows.length === 0) {
      return res.send('Esercizio non trovato.');
    }

    const exercises = rows.map(ex => {
      try {
        const images = JSON.parse(ex.images || '[]');
        return { ...ex, thumbnail: images[0] || null };
      } catch {
        return { ...ex, thumbnail: null };
      }
    });

    res.render('search_results', { exercises });
  });
});



// Salva esercizio
app.post('/exercises', upload.array('images', 10), (req, res) => {
  const { name, complexity, description } = req.body;

  const exercise_type = JSON.stringify([].concat(req.body.exercise_type || []));
  const position = JSON.stringify([].concat(req.body.position || []));
  const type_of_exercise = JSON.stringify([].concat(req.body.type_of_exercise || []));
  const muscle_group = JSON.stringify([].concat(req.body.muscle_group || []));
  const images = JSON.stringify(req.files.map(f => '/uploads/' + f.filename));

db.run(`
  INSERT INTO exercises (
    name, complexity, description, exercise_type, position, type_of_exercise, muscle_group, images
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`, [name, complexity, description, exercise_type, position, type_of_exercise, muscle_group, images], (err) => {
    if (err) {
      console.error('Errore nel salvataggio esercizio:', err);
      return res.send('Errore nel salvataggio esercizio');
    }
    res.redirect('/exercises');
  });
});



// Dettaglio esercizio
app.put('/exercises/:id', upload.array('images', 10), (req, res) => {
  const id = req.params.id;
  const { name, complexity, description } = req.body;
  const exercise_type = JSON.stringify([].concat(req.body.exercise_type || []));
  const position = JSON.stringify([].concat(req.body.position || []));
  const equipment = JSON.stringify([].concat(req.body.equipment || []));
  const muscle_group = JSON.stringify([].concat(req.body.muscle_group || []));

  // Se ci sono immagini nuove, usale. Altrimenti lascia invariato il campo immagini
  const images = req.files && req.files.length > 0
    ? JSON.stringify(req.files.map(f => '/uploads/' + f.filename))
    : null;

  const query = `
    UPDATE exercises
    SET name = ?, complexity = ?, description = ?,
        exercise_type = ?, position = ?, equipment = ?, muscle_group = ?
        ${images ? ', images = ?' : ''}
    WHERE id = $1'
  `;

  const params = [name, complexity, description, exercise_type, position, equipment, muscle_group];
  if (images) params.push(images);
  params.push(id);

  db.run(query, params, (err) => {
    if (err) {
      console.error('Errore SQL:', err); // 👈 Questo ti aiuta a capire dove fallisce
      return res.send('Errore nella modifica');
    }

    res.redirect('/exercises/' + id);
  });
});


// Modifica esercizio
app.get('/exercises/:id/edit', (req, res) => {
  db.get('SELECT * FROM exercises WHERE id = ?', [req.params.id], (err, exercise) => {
    if (err || !exercise) return res.send('Esercizio non trovato.');
    res.render('edit_exercise', { exercise });
  });
});

app.get('/exercises/:id', (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM exercises WHERE id = ?', [id], (err, exercise) => {
    if (err || !exercise) return res.status(404).send('Esercizio non trovato.');

    try {
      exercise.muscle_group = JSON.parse(exercise.muscle_group || '[]');
      exercise.exercise_type = JSON.parse(exercise.exercise_type || '[]');
      exercise.position = JSON.parse(exercise.position || '[]');
      exercise.equipment = JSON.parse(exercise.equipment || '[]');
      exercise.images = JSON.parse(exercise.images || '[]');
    } catch (e) {
      return res.send('Errore nel parsing dei dati.');
    }

    res.render('exercise_detail', { exercise });
  });
});

app.delete('/exercises/:id/image', (req, res) => {
  const id = req.params.id;
  const { src } = req.body;
  const imagePath = path.join(__dirname, 'public', src); // path completo

  db.get('SELECT images FROM exercises WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(500).send('Esercizio non trovato');

    let images;
    try {
      images = JSON.parse(row.images || '[]');
    } catch (e) {
      return res.send('Errore nel parsing immagini');
    }

    const updatedImages = images.filter(i => i !== src);

    // Rimuove il file fisicamente se esiste
    fs.unlink(imagePath, (fsErr) => {
      if (fsErr && fsErr.code !== 'ENOENT') {
        console.error('Errore durante l\'eliminazione del file:', fsErr);
        return res.send('Errore nel file system');
      }

      // Aggiorna il database
      db.run('UPDATE exercises SET images = ? WHERE id = ?', [JSON.stringify(updatedImages), id], (updateErr) => {
        if (updateErr) return res.send('Errore nel salvataggio immagini aggiornate');
        res.redirect('/exercises/' + id);
      });
    });
  });
});


app.get('/exercises/group/:muscle', async (req, res) => {
  const group = req.params.muscle;

  try {
    const allExercises = await db.all('SELECT * FROM exercises');
    const exercises = allExercises.filter(ex => {
      try {
        const groups = JSON.parse(ex.muscle_group || '[]');
        return groups.includes(group);
      } catch {
        return false;
      }
    }).map(ex => {
      try {
        const images = JSON.parse(ex.images || '[]');
        return { ...ex, thumbnail: images[0] || null };
      } catch {
        return { ...ex, thumbnail: null };
      }
    });

    const workouts = await db.all('SELECT * FROM workouts ORDER BY name');

    res.render('group_gallery', {
      groupName: group.charAt(0).toUpperCase() + group.slice(1).replace(/_/g, ' '),
      exercises,
      workouts
    });

  } catch (err) {
    console.error(err);
    res.send('Errore nel recupero dati.');
  }
});



app.put('/exercises/:id', upload.array('images', 10), (req, res) => {
  const id = req.params.id;
  const { name, complexity, description } = req.body;
  const exercise_type = JSON.stringify([].concat(req.body.exercise_type || []));
  const position = JSON.stringify([].concat(req.body.position || []));
  const equipment = JSON.stringify([].concat(req.body.equipment || []));
  const muscle_group = JSON.stringify([].concat(req.body.muscle_group || []));
  const images = req.files.length ? JSON.stringify(req.files.map(f => '/uploads/' + f.filename)) : null;

  const query = `
    UPDATE exercises SET name = ?, complexity = ?, description = ?, 
    exercise_type = ?, position = ?, equipment = ?, muscle_group = ?
    ${images ? ', images = ?' : ''}
    WHERE id = $1'
  `;
  const params = [name, complexity, description, exercise_type, position, equipment, muscle_group];
  if (images) params.push(images);
  params.push(id);

  db.run(query, params, (err) => {
    if (err) return res.send('Errore nella modifica');
    res.redirect('/exercises/' + id);
  });
});

app.delete('/exercises/:id', (req, res) => {
  db.run('DELETE FROM exercises WHERE id = ?', [req.params.id], err => {
    if (err) return res.send('Errore nella cancellazione');
    res.redirect('/exercises');
  });
});

// ========== ROTTE WORKOUT ==========

app.get('/workouts', (req, res) => {
  res.render('workouts');
});

app.get('/workouts/new', (req, res) => {
  res.render('new_workout');
});

app.post('/workouts', (req, res) => {
  const { name, category, equipment, muscle_group, exercise_type, position } = req.body;

  const values = [
    name,
    category,
    JSON.stringify([].concat(equipment || [])),
    JSON.stringify([].concat(muscle_group || [])),
    JSON.stringify([].concat(exercise_type || [])),
    JSON.stringify([].concat(position || []))
  ];

  db.run(`
    INSERT INTO workouts (name, category, equipment, muscle_group, exercise_type, position)
    VALUES (?, ?, ?, ?, ?, ?)`, values, function(err) {
    if (err) return res.send('Errore nel salvataggio workout');
    res.redirect('/workouts/category/' + category);
  });
});

app.get('/workouts/category/:slug', (req, res) => {
  const { slug } = req.params;
  const sort = req.query.sort || 'name';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const allowed = ['name', 'category', 'equipment', 'muscle_group', 'exercise_type', 'position'];
  const sortColumn = allowed.includes(sort) ? sort : 'name';

  db.all(`SELECT * FROM workouts WHERE category = ? ORDER BY ${sortColumn} COLLATE NOCASE ${order}`, [slug], (err, workouts) => {
    if (err) return res.status(500).send('Errore nel recupero dei workout per categoria');
    res.render('workouts_by_category', { workouts, category: slug, sort, order });
  });
});

app.get('/workouts/:id', (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM workouts WHERE id = ?', [id], (err, workout) => {
    if (err || !workout) return res.status(404).send('Workout non trovato.');

    db.all(`
      SELECT e.* FROM exercises e
      INNER JOIN workout_exercises we ON e.id = we.exercise_id
      WHERE we.workout_id = ?
    `, [id], (err2, exercises) => {
      if (err2) return res.status(500).send('Errore nel recupero esercizi.');
      res.render('workout_detail', { workout, exercises });
    });
  });
});

app.get('/workouts/:id/edit', (req, res) => {
  db.get('SELECT * FROM workouts WHERE id = ?', [req.params.id], (err, workout) => {
    if (err || !workout) return res.send('Workout non trovato.');
    res.render('edit_workout', { workout });
  });
});

app.put('/workouts/:id', (req, res) => {
  const { name, category, equipment, muscle_group, exercise_type, position } = req.body;

  const values = [
    name,
    category,
    JSON.stringify([].concat(equipment || [])),
    JSON.stringify([].concat(muscle_group || [])),
    JSON.stringify([].concat(exercise_type || [])),
    JSON.stringify([].concat(position || [])),
    req.params.id
  ];

  db.run(`
    UPDATE workouts SET name = ?, category = ?, equipment = ?, muscle_group = ?, exercise_type = ?, position = ?
    WHERE id = ?`, values, (err) => {
    if (err) return res.send('Errore nella modifica workout');
    res.redirect('/workouts/category/' + category);
  });
});

app.delete('/workouts/:id', (req, res) => {
  db.run('DELETE FROM workouts WHERE id = ?', [req.params.id], err => {
    if (err) return res.send('Errore nella cancellazione workout');
    res.redirect('/workouts');
  });
});

// AVVIO SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
