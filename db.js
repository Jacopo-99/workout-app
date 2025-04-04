const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./exercise.db'); // il tuo file SQLite con le tabelle exercises e workouts

// Crea le tabelle se non esistono
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type_of_exercise TEXT NOT NULL,
      complexity TEXT CHECK (complexity IN ('simple', 'complex')),
      exercise_type TEXT CHECK (
        exercise_type IN ('strength', 'cardio', 'stretch', 'warm up')
      ),
      position TEXT CHECK (position IN ('standing', 'seated', 'laying')),
      muscle_group TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS workout_exercises (
      workout_id INTEGER,
      exercise_id INTEGER,
      PRIMARY KEY (workout_id, exercise_id),
      FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises (id) ON DELETE CASCADE
    );
  `);
});

module.exports = db;


