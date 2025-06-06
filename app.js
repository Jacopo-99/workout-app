const express = require('express');
const path = require('path');
require('dotenv').config();

// Import db and json utilities
const db = require('./db');
const { safeJSONParse } = require('./json-utils');

const methodOverride = require('method-override');
const fs = require('fs');

const app = express();

// Ensure uploads folder exists
const uploadPath = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

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

// FIXED: Pagina di ricerca esercizi
app.get('/exercises/search', (req, res) => {
  console.log("Search params:", req.query);
  const { equipment, complexity, type, position, muscle_group } = req.query;

  let query = 'SELECT * FROM exercises';
  const conditions = [];
  const params = [];
  let paramCounter = 1;

  if (equipment) {
    conditions.push(`equipment::jsonb @> $${paramCounter}::jsonb`);
    params.push(JSON.stringify([equipment]));
    paramCounter++;
  }

  if (complexity) {
    conditions.push(`complexity = $${paramCounter}`);
    params.push(complexity);
    paramCounter++;
  }

  if (type) {
    conditions.push(`exercise_type::jsonb @> $${paramCounter}::jsonb`);
    params.push(JSON.stringify([type]));
    paramCounter++;
  }

  if (position) {
    conditions.push(`position::jsonb @> $${paramCounter}::jsonb`);
    params.push(JSON.stringify([position]));
    paramCounter++;
  }

  if (muscle_group) {
    conditions.push(`muscle_group::jsonb @> $${paramCounter}::jsonb`);
    params.push(JSON.stringify([muscle_group]));
    paramCounter++;
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  console.log("SQL Query:", query);
  console.log("SQL Params:", params);

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Search error:", err);
      return res.status(500).send('Errore nella ricerca: ' + err.message);
    }

    if (!rows || rows.length === 0) {
      // Se non ci sono esercizi, carico comunque i workouts
      db.all('SELECT * FROM workouts', [], (err2, workouts) => {
        if (err2) {
          console.error("Workouts fetch error:", err2);
          return res.render('search_results', { exercises: [], workouts: [] });
        }
        res.render('search_results', { exercises: [], workouts });
      });
      return;
    }

    const exercises = rows.map(ex => {
      const images = safeJSONParse(ex.images, []);
      return { ...ex, thumbnail: images[0] || null };
    });

    // Carico anche i workouts
    db.all('SELECT * FROM workouts', [], (err2, workouts) => {
      if (err2) {
        console.error("Workouts fetch error:", err2);
        return res.render('search_results', { exercises, workouts: [] });
      }
      res.render('search_results', { exercises, workouts });
    });
  });
});


// Fixed exercise save route for PostgreSQL ARRAY type

// Salva esercizio
app.post('/exercises', (req, res) => {
  console.log('🧠 BODY:', req.body);
  const { title, complexity, description, image_url } = req.body;

  if (!title || title.trim() === '') {
    return res.send('Il campo titolo è obbligatorio');
  }

  if (!image_url || image_url.trim() === '') {
    return res.send('You must provide an image URL.');
  }

  const exercise_type = [].concat(req.body.exercise_type || []);
  const position = [].concat(req.body.position || []);
  const equipment = [].concat(req.body.equipment || []);
  const muscle_group = [].concat(req.body.muscle_group || []);
  const images = [image_url.trim()];

  const query = `
    INSERT INTO exercises 
      (title, complexity, exercise_type, position, equipment, muscle_group, description, images)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  const values = [
    title,
    complexity,
    JSON.stringify(exercise_type),
    JSON.stringify(position),
    JSON.stringify(equipment),
    JSON.stringify(muscle_group),
    description,
    images
  ];

  db.run(query, values, (err) => {
    if (err) {
      console.error('Errore SQL nel salvataggio esercizio:', err);
      return res.status(500).send('Errore nel salvataggio esercizio: ' + err.message);
    }

    res.redirect('/exercises');
  });
});


// Update exercise with proper array handling
app.put('/exercises/:id', (req, res) => {
  const id = req.params.id;
  const { title, complexity, description } = req.body;
  const exercise_type = JSON.stringify([].concat(req.body.exercise_type || []));
  const position = JSON.stringify([].concat(req.body.position || []));
  const equipment = JSON.stringify([].concat(req.body.equipment || []));
  const muscle_group = JSON.stringify([].concat(req.body.muscle_group || []));

  // Get current images
  db.get('SELECT * FROM exercises WHERE id = $1', [id], (err, exercise) => {
    if (err) {
      console.error("Error fetching current images:", err);
      return res.status(500).send('Errore nel recupero esercizio');
    }

    // Handle current images as a native array
    let currentImages = [];
    if (exercise && exercise.images) {
      currentImages = exercise.images; // Should already be an array
    }
    
    let newImages = [];
    if (req.body.image_url && req.body.image_url.trim() !== '') {
      newImages.push(req.body.image_url.trim());
    }
    let allImages = [...currentImages, ...newImages];    
    
    const query = `
      UPDATE exercises 
      SET title = $1, complexity = $2, description = $3,
          exercise_type = $4, position = $5, equipment = $6, muscle_group = $7,
          images = $8
      WHERE id = $9
    `;
    
    const params = [
      title, 
      complexity, 
      description, 
      exercise_type, 
      position, 
      equipment, 
      muscle_group,
      allImages, // Send as native JavaScript array
      id
    ];

    db.run(query, params, (err) => {
      if (err) {
        console.error("Update error:", err);
        return res.status(500).send('Errore nella modifica: ' + err.message);
      }
      res.redirect('/exercises/' + id);
    });
  });
});

// Handle image deletion with proper array type
app.delete('/exercises/:id/image', (req, res) => {
  const id = req.params.id;
  const { src } = req.body;
  const imagePath = path.join(__dirname, 'public', src);

  db.get('SELECT images FROM exercises WHERE id = $1', [id], (err, row) => {
    if (err || !row) {
      console.error("Error fetching images:", err);
      return res.status(500).send('Esercizio non trovato');
    }

    // Images should be a native array
    const images = row.images || [];
    const updatedImages = images.filter(i => i !== src);

    // Rimuove il file fisicamente se esiste
    fs.unlink(imagePath, (fsErr) => {
      if (fsErr && fsErr.code !== 'ENOENT') {
        console.error('Errore durante l\'eliminazione del file:', fsErr);
      }

      // Aggiorna il database - use native array
      db.run('UPDATE exercises SET images = $1 WHERE id = $2', 
        [updatedImages, id], 
        (updateErr) => {
          if (updateErr) {
            console.error("Error updating images:", updateErr);
            return res.send('Errore nel salvataggio immagini aggiornate');
          }
          res.redirect('/exercises/' + id);
      });
    });
  });
});

// Fixed exercise detail route
app.get('/exercises/:id', (req, res) => {
  const id = req.params.id;
  console.log("Getting exercise details for ID:", id);

  db.get('SELECT * FROM exercises WHERE id = $1', [id], (err, exercise) => {
    if (err) {
      console.error("Exercise detail error:", err);
      return res.status(500).send('Errore nel recupero esercizio: ' + err.message);
    }

    if (!exercise) {
      return res.status(404).send('Esercizio non trovato.');
    }

// Parse JSON fields safely
exercise.muscle_group = safeJSONParse(exercise.muscle_group, []);
exercise.exercise_type = safeJSONParse(exercise.exercise_type, []);
exercise.position = safeJSONParse(exercise.position, []);
exercise.equipment = safeJSONParse(exercise.equipment, []);

// FIX images: handle string with commas or JSON array
if (exercise.images) {
  if (Array.isArray(exercise.images)) {
    // ok già array
  } else if (typeof exercise.images === 'string') {
    try {
      exercise.images = JSON.parse(exercise.images);
    } catch (e) {
      exercise.images = exercise.images.split(',').map(img => img.trim()).filter(img => img.length > 0);
    }
  } else {
    exercise.images = [];
  }
} else {
  exercise.images = [];
}

    res.render('exercise_detail', { exercise });
  });
});

// FIXED: Elimina una immagine da un esercizio
app.delete('/exercises/:id/image', (req, res) => {
  const id = req.params.id;
  const { src } = req.body;
  const imagePath = path.join(__dirname, 'public', src);

  db.get('SELECT images FROM exercises WHERE id = $1', [id], (err, row) => {
    if (err || !row) {
      console.error("Error fetching images:", err);
      return res.status(500).send('Esercizio non trovato');
    }

    const images = safeJSONParse(row.images, []);
    const updatedImages = images.filter(i => i !== src);

    // Rimuove il file fisicamente se esiste
    fs.unlink(imagePath, (fsErr) => {
      if (fsErr && fsErr.code !== 'ENOENT') {
        console.error('Errore durante l\'eliminazione del file:', fsErr);
      }

      // Aggiorna il database
      db.run('UPDATE exercises SET images = $1 WHERE id = $2', 
        [JSON.stringify(updatedImages), id], 
        (updateErr) => {
          if (updateErr) {
            console.error("Error updating images:", updateErr);
            return res.send('Errore nel salvataggio immagini aggiornate');
          }
          res.redirect('/exercises/' + id);
      });
    });
  });
});

// Fixed code for the workouts title issue

// FIXED: Galleria esercizi per gruppo muscolare
app.get('/exercises/group/:muscle', (req, res) => {
  const group = req.params.muscle;
  console.log("Getting exercises for muscle group:", group);

  // Using the jsonb containment operator for PostgreSQL
  const query = `
    SELECT * FROM exercises 
    WHERE muscle_group::jsonb @> $1::jsonb
  `;

  db.all(query, [JSON.stringify([group])], (err, exercises) => {
    if (err) {
      console.error("Muscle group error:", err);
      return res.status(500).send('Errore nel recupero esercizi: ' + err.message);
    }

    // Process the exercises to add thumbnails
    const processedExercises = exercises.map(ex => {
      // Images is a native array, so no need to parse
      const images = ex.images || [];
      return { ...ex, thumbnail: images[0] || null };
    });

    // First check what columns exist in the workouts table
    db.all(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'workouts'
    `, [], (err, columns) => {
      if (err) {
        console.error("Error checking columns:", err);
        // If we can't check columns, just try to get workouts without ordering
        getWorkoutsWithoutOrdering();
        return;
      }
      
      const columnNames = columns.map(col => col.column_name);
      console.log("Available columns in workouts table:", columnNames);
      
      // Check if title exists
      if (columnNames.includes('title')) {
        getWorkoutsOrderByTitle();
      } else if (columnNames.includes('name')) {
        getWorkoutsOrderByName();
      } else {
        getWorkoutsWithoutOrdering();
      }
    });
    
    // Helper functions to keep the code clean
    function getWorkoutsOrderByTitle() {
      db.all('SELECT * FROM workouts ORDER BY title', [], (err, workouts) => {
        if (err) {
          console.error("Workouts title error:", err);
          getWorkoutsWithoutOrdering();
          return;
        }
        renderPage(workouts);
      });
    }
    
    function getWorkoutsOrderByName() {
      db.all('SELECT * FROM workouts ORDER BY name', [], (err, workouts) => {
        if (err) {
          console.error("Workouts name error:", err);
          getWorkoutsWithoutOrdering();
          return;
        }
        renderPage(workouts);
      });
    }
    
    function getWorkoutsWithoutOrdering() {
      db.all('SELECT * FROM workouts', [], (err, workouts) => {
        if (err) {
          console.error("Workouts error:", err);
          renderPage([]);
          return;
        }
        renderPage(workouts);
      });
    }
    
    function renderPage(workouts) {
      res.render('group_gallery', {
        groupName: group.charAt(0).toUpperCase() + group.slice(1).replace(/_/g, ' '),
        exercises: processedExercises,
        workouts: workouts || []
      });
    }
  });
});

// Elimina esercizio
app.delete('/exercises/:id', (req, res) => {
  db.run('DELETE FROM exercises WHERE id = $1', [req.params.id], err => {
    if (err) {
      console.error("Delete error:", err);
      return res.status(500).send('Errore nella cancellazione: ' + err.message);
    }
    res.redirect('/exercises');
  });
});

// ========== ROTTE WORKOUT ==========

// Pagina lista workout
app.get('/workouts', (req, res) => {
  res.render('workouts');
});

// Pagina nuovo workout
app.get('/workouts/new', (req, res) => {
  res.render('new_workout');
});

// Salvataggio nuovo workout
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
    VALUES ($1, $2, $3, $4, $5, $6)
  `, values, function(err) {
    if (err) {
      console.error("Workout save error:", err);
      return res.status(500).send('Errore nel salvataggio workout: ' + err.message);
    }
    res.redirect('/workouts/category/' + category);
  });
});

// Elimina workout
app.delete('/workouts/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM workouts WHERE id = $1', [id], (err) => {
    if (err) {
      console.error("Workout delete error:", err);
      return res.status(500).send('Errore nella cancellazione del workout: ' + err.message);
    }
    res.redirect('/workouts');
  });
});

// FIXED: Workouts by category
app.get('/workouts/category/:slug', (req, res) => {
  const { slug } = req.params;
  const sort = req.query.sort || 'name';
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';

  // Only allow sorting by scalar fields
  const allowed = ['name', 'category', 'id', 'created_at'];
  const sortColumn = allowed.includes(sort) ? sort : 'name';

  const query = `SELECT * FROM workouts WHERE category = $1 ORDER BY ${sortColumn} ${order}`;
  console.log("Workouts category query:", query);
  
  db.all(query, [slug], (err, workouts) => {
    if (err) {
      console.error("Workouts category error:", err);
      return res.status(500).send('Errore nel recupero dei workout per categoria: ' + err.message);
    }
    
    // Process the workouts
    const processedWorkouts = workouts.map(workout => {
      return {
        ...workout,
        equipment: safeJSONParse(workout.equipment, []),
        muscle_group: safeJSONParse(workout.muscle_group, []),
        exercise_type: safeJSONParse(workout.exercise_type, []),
        position: safeJSONParse(workout.position, [])
      };
    });
    
    res.render('workouts_by_category', { 
      workouts: processedWorkouts, 
      category: slug, 
      sort, 
      order 
    });
  });
});

//Edit Workout
app.get('/exercises/:id/edit', (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM exercises WHERE id = $1', [id], (err, exercise) => {
    if (err) {
      console.error("Error fetching exercise for edit:", err);
      return res.status(500).send('Errore nel recupero esercizio: ' + err.message);
    }

    if (!exercise) {
      return res.status(404).send('Esercizio non trovato.');
    }

    // Parse JSON fields safely if needed
    const safeParse = (data) => {
      if (Array.isArray(data)) return data;
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    };
    
    exercise.equipment = safeParse(exercise.equipment);
    exercise.exercise_type = safeParse(exercise.exercise_type);
    exercise.position = safeParse(exercise.position);
    exercise.muscle_group = safeParse(exercise.muscle_group);

    res.render('edit_exercise', { exercise });
  });
});


// FIXED: Workout detail
app.get('/workouts/:id', (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM workouts WHERE id = $1', [id], (err, workout) => {
    if (err) {
      console.error("Workout detail error:", err);
      return res.status(500).send('Errore nel recupero workout: ' + err.message);
    }
    
    if (!workout) {
      return res.status(404).send('Workout non trovato.');
    }

    // Parse JSON fields safely
    workout.equipment = safeJSONParse(workout.equipment, []);
    workout.muscle_group = safeJSONParse(workout.muscle_group, []);
    workout.exercise_type = safeJSONParse(workout.exercise_type, []);
    workout.position = safeJSONParse(workout.position, []);

    db.all(`
      SELECT e.*, we.id AS we_id, we.rest_time_seconds 
      FROM workout_exercises we
      LEFT JOIN exercises e ON e.id = we.exercise_id
      WHERE we.workout_id = $1
      ORDER BY we.order_index;
    `, [id], (err2, rows) => {
      if (err2) {
        console.error("Workout exercises error:", err2);
        return res.status(500).send('Errore nel recupero esercizi: ' + err2.message);
      }

      // Process exercises + rest periods
      const processedItems = rows.map(item => {
        if (item.exercise_id === null) {
          return {
            isRest: true,
            we_id: item.we_id,
            rest_time_seconds: item.rest_time_seconds
          };
        } else {
          return {
            ...item,
            isRest: false,
            muscle_group: safeJSONParse(item.muscle_group, []),
            exercise_type: safeJSONParse(item.exercise_type, []),
            position: safeJSONParse(item.position, []),
            equipment: safeJSONParse(item.equipment, []),
            images: safeJSONParse(item.images, [])
          };
        }
      });

      res.render('workout_detail', { workout, exercises: processedItems });
    });
  });
});


// Add exercise to a workout
app.post('/workouts/add-exercise', (req, res) => {
  const { workout_id, exercise_id } = req.body;

  const query = `
    INSERT INTO workout_exercises (workout_id, exercise_id)
    VALUES ($1, $2)
    ON CONFLICT (workout_id, exercise_id) DO NOTHING
  `;

  db.run(query, [workout_id, exercise_id], (err) => {
    if (err) {
      console.error("Error adding exercise to workout:", err);
      return res.status(500).send('Errore nell\'aggiunta esercizio al workout: ' + err.message);
    }
    res.redirect('/workouts/' + workout_id);
  });
});


// Edit Workout
app.get('/workouts/:id/edit', (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM workouts WHERE id = $1', [id], (err, workout) => {
    if (err) {
      console.error("Error fetching workout for edit:", err);
      return res.status(500).send('Errore nel recupero workout: ' + err.message);
    }

    if (!workout) {
      return res.status(404).send('Workout non trovato.');
    }

    // Parse JSON fields safely if needed
    const safeParse = (data) => {
      if (Array.isArray(data)) return data;
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    };

    workout.equipment = safeParse(workout.equipment);
    workout.exercise_type = safeParse(workout.exercise_type);
    workout.position = safeParse(workout.position);
    workout.muscle_group = safeParse(workout.muscle_group);

    res.render('edit_workout', { workout });
  });
});

// Update Workout
app.put('/workouts/:id', (req, res) => {
  const id = req.params.id;
  const { name, category, equipment, muscle_group, exercise_type, position } = req.body;

  const query = `
    UPDATE workouts 
    SET name = $1, category = $2, equipment = $3, muscle_group = $4, exercise_type = $5, position = $6
    WHERE id = $7
  `;

  const params = [
    name,
    category,
    JSON.stringify([].concat(equipment || [])),
    JSON.stringify([].concat(muscle_group || [])),
    JSON.stringify([].concat(exercise_type || [])),
    JSON.stringify([].concat(position || [])),
    id
  ];

  db.run(query, params, (err) => {
    if (err) {
      console.error("Workout update error:", err);
      return res.status(500).send('Errore nella modifica del workout: ' + err.message);
    }
    res.redirect('/workouts/category/' + category);
  });
});

// Update-sequence route in app.js
app.put('/workouts/:id/update-sequence', (req, res) => {
  const id = req.params.id;
  const { exercise_ids, sets, reps, minutes, seconds, item_types, exercise_types, breath_type } = req.body;

  console.log('Received update-sequence with data:', {
    workout_id: id,
    exercise_ids,
    item_types,
    sets,
    reps,
    minutes,
    seconds,
    exercise_types,
    breath_type
  });

  // First, remove all existing exercises and rest periods for this workout
  db.run('DELETE FROM workout_exercises WHERE workout_id = $1', [id], (deleteErr) => {
    if (deleteErr) {
      console.error('Error deleting existing workout items:', deleteErr);
      return res.status(500).send('Error updating workout sequence: ' + deleteErr.message);
    }

    // Now insert all exercises and rest periods in the new order
    const insertPromises = exercise_ids.map((exerciseId, index) => {
      if (!exerciseId) {
        return Promise.resolve();
      }

      const set = parseInt(sets[index]) || 0;
      const rep = parseInt(reps[index]) || 0;
      const min = parseInt(minutes[index]) || 0;
      const sec = parseInt(seconds[index]) || 0;
      const orderIndex = index;
      const isRest = exerciseId === 'rest' || (item_types && item_types[index] === 'rest');
      const type = exercise_types?.[index] || 'reps';
      const breath = breath_type?.[index] || null;

      return new Promise((resolve, reject) => {
        if (isRest) {
          const totalRestSeconds = min * 60 + sec;

          db.run(
            `INSERT INTO workout_exercises 
              (workout_id, exercise_id, rest_time_seconds, order_index, sets, reps, minutes, seconds, breath_type) 
             VALUES ($1, NULL, $2, $3, 0, 0, $4, $5, NULL)`,
            [id, totalRestSeconds, orderIndex, min, sec],
            function(err) {
              if (err) {
                console.error('Rest period insert error:', err);
                reject(err);
              } else {
                resolve();
              }
            }
          );
        } else {
          db.run(
            `INSERT INTO workout_exercises 
              (workout_id, exercise_id, sets, reps, minutes, seconds, order_index, rest_time_seconds, breath_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)`,
            [id, exerciseId, set, rep, min, sec, orderIndex, type === 'breath' ? breath : null],
            function(err) {
              if (err) {
                console.error('Exercise insert error:', err);
                reject(err);
              } else {
                resolve();
              }
            }
          );
        }
      });
    });

    Promise.all(insertPromises)
      .then(() => {
        console.log(`Successfully updated workout ${id} sequence`);
        res.redirect('/workouts/' + id);
      })
      .catch(err => {
        console.error('Sequence update error:', err);
        res.status(500).send('Error saving workout sequence: ' + err.message);
      });
  });
});



// AVVIO SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});