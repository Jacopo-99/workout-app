const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Homepage
app.get("/", (req, res) => {
  res.render("index");
});

// Show all exercises
app.get("/exercises", async (req, res) => {
  try {
    const exercises = await db.all("SELECT * FROM exercises ORDER BY id DESC");
    res.render("exercises", { exercises });
  } catch (err) {
    res.status(500).send("Internal Server Error");
  }
});

// Add exercise form
app.get("/exercises/add", (req, res) => {
  res.render("add_exercise");
});

// Submit new exercise
app.post("/exercises", upload.array("images", 5), async (req, res) => {
  const {
    title,
    complexity,
    exercise_type,
    position,
    equipment,
    muscle_group,
    description
  } = req.body;

  const imagePaths = req.files.map(file => "/uploads/" + file.filename);

  const values = [
    title,
    complexity,
    JSON.stringify(exercise_type instanceof Array ? exercise_type : [exercise_type]),
    JSON.stringify(position instanceof Array ? position : [position]),
    JSON.stringify(equipment instanceof Array ? equipment : [equipment]),
    JSON.stringify(muscle_group instanceof Array ? muscle_group : [muscle_group]),
    description,
    imagePaths
  ];

  const sql = `
    INSERT INTO exercises (title, complexity, exercise_type, position, equipment, muscle_group, description, images)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;

  try {
    await db.run(sql, values);
    res.redirect("/exercises");
  } catch (err) {
    console.error("Errore nel salvataggio esercizio:", err);
    res.status(500).send("Errore nel salvataggio esercizio");
  }
});

// Exercise details
app.get("/exercises/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const exercise = await db.get("SELECT * FROM exercises WHERE id = $1", [id]);
    if (!exercise) {
      return res.status(404).send("Esercizio non trovato.");
    }
    res.render("exercise_detail", { exercise });
  } catch (err) {
    res.status(500).send("Errore nel recupero dell'esercizio.");
  }
});

// Edit exercise form
app.get("/exercises/:id/edit", async (req, res) => {
  const { id } = req.params;
  try {
    const exercise = await db.get("SELECT * FROM exercises WHERE id = $1", [id]);
    if (!exercise) {
      return res.status(404).send("Esercizio non trovato.");
    }
    res.render("edit_exercise", { exercise });
  } catch (err) {
    res.status(500).send("Errore nel recupero dell'esercizio.");
  }
});

// Submit edit
app.post("/exercises/:id/edit", upload.array("images", 5), async (req, res) => {
  const { id } = req.params;
  const {
    title,
    complexity,
    exercise_type,
    position,
    equipment,
    muscle_group,
    description
  } = req.body;

  try {
    const existing = await db.get("SELECT * FROM exercises WHERE id = $1", [id]);
    if (!existing) return res.status(404).send("Esercizio non trovato");

    let currentImages = existing.images || [];
    if (typeof currentImages === "string") currentImages = JSON.parse(currentImages);

    const newImages = req.files.map(file => "/uploads/" + file.filename);
    const finalImages = [...currentImages, ...newImages];

    const values = [
      title,
      complexity,
      JSON.stringify(exercise_type instanceof Array ? exercise_type : [exercise_type]),
      JSON.stringify(position instanceof Array ? position : [position]),
      JSON.stringify(equipment instanceof Array ? equipment : [equipment]),
      JSON.stringify(muscle_group instanceof Array ? muscle_group : [muscle_group]),
      description,
      finalImages,
      id
    ];

    const sql = `
      UPDATE exercises
      SET title = $1, complexity = $2, exercise_type = $3, position = $4,
          equipment = $5, muscle_group = $6, description = $7, images = $8
      WHERE id = $9
    `;

    await db.run(sql, values);
    res.redirect(`/exercises/${id}`);
  } catch (err) {
    console.error("Errore nella modifica:", err);
    res.status(500).send("Errore nella modifica");
  }
});

// Delete an image from an exercise
app.delete("/exercises/:id/image", async (req, res) => {
  const { id } = req.params;
  const { image } = req.body;

  try {
    const exercise = await db.get("SELECT * FROM exercises WHERE id = $1", [id]);
    if (!exercise) return res.status(404).send("Esercizio non trovato");

    let currentImages = exercise.images || [];
    if (typeof currentImages === "string") currentImages = JSON.parse(currentImages);

    const updatedImages = currentImages.filter(img => img !== image);
    const sql = "UPDATE exercises SET images = $1 WHERE id = $2";
    await db.run(sql, [updatedImages, id]);

    // Delete file physically
    const filePath = path.join(__dirname, image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.status(200).send("Immagine eliminata");
  } catch (err) {
    console.error("Errore nell'eliminazione immagine:", err);
    res.status(500).send("Errore nell'eliminazione immagine");
  }
});

// Search exercises
app.get("/exercises/search", async (req, res) => {
  try {
    const allExercises = await db.all("SELECT * FROM exercises");

    const { equipment, complexity, type, position, muscle_group } = req.query;

    const filtered = allExercises.filter(ex => {
      const matchesEquipment = !equipment || (Array.isArray(ex.equipment) ? ex.equipment.includes(equipment) : JSON.parse(ex.equipment || "[]").includes(equipment));
      const matchesComplexity = !complexity || ex.complexity === complexity;
      const matchesType = !type || (Array.isArray(ex.exercise_type) ? ex.exercise_type.includes(type) : JSON.parse(ex.exercise_type || "[]").includes(type));
      const matchesPosition = !position || (Array.isArray(ex.position) ? ex.position.includes(position) : JSON.parse(ex.position || "[]").includes(position));
      const matchesMuscleGroup = !muscle_group || (Array.isArray(ex.muscle_group) ? ex.muscle_group.includes(muscle_group) : JSON.parse(ex.muscle_group || "[]").includes(muscle_group));
      return matchesEquipment && matchesComplexity && matchesType && matchesPosition && matchesMuscleGroup;
    });

    res.render("search_results", { exercises: filtered });
  } catch (err) {
    console.error("Errore nella ricerca:", err);
    res.status(500).send("Errore nella ricerca");
  }
});

// View exercises by muscle group
app.get("/exercises/group/:group", async (req, res) => {
  const { group } = req.params;

  try {
    const allExercises = await db.all("SELECT * FROM exercises");
    const filtered = allExercises.filter(ex => {
      const groups = typeof ex.muscle_group === "string" ? JSON.parse(ex.muscle_group || "[]") : ex.muscle_group;
      return groups.includes(group);
    });

    res.render("group_gallery", {
      exercises: filtered,
      groupName: group.charAt(0).toUpperCase() + group.slice(1)
    });
  } catch (err) {
    console.error("Errore nel recupero gruppo:", err);
    res.status(500).send("Errore nel recupero gruppo");
  }
});

// START SERVER
app.listen(PORT, () => {
  console.log(`✅ DATABASE_URL: ${process.env.DATABASE_URL}`);
  console.log(`✅ Server running on port ${PORT}`);
});
