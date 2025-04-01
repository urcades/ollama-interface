import express from "express";

const app = express();
const port = 3333;

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory if you have any
app.use(express.static("public"));

// Basic route for testing
app.get("/", (req, res) => {
  res.json({ message: "Server is running!" });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
