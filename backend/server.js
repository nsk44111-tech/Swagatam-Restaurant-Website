
const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const nodemailer = require("nodemailer");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3001;


// Configure Gmail transporter using Nodemailer
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify Gmail connection
transporter.verify((error, success) => {
    if (error) {
        console.error("Email configuration error:", error.message);
    } else {
        console.log("Gmail email service is ready!");
    }
});

// Middleware
app.use(express.json());

// Monitor incoming requests
app.use((req, res, next) => {
    console.log("Request received:", req.method, req.url);
    next();
});

// Connect to MySQL database
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
   port: Number(process.env.DB_PORT || 3306)
});

db.connect((err) => {
    if (err) {
        console.error("MySQL connection failed:", err.message);
        return;
    }

    console.log("Connected to Swagatam MySQL database!");
});

// Serve existing restaurant website
app.use(
    express.static(
       path.join(__dirname, "Swagatam_Restaurant_Website")
    )
);

// Test backend API
app.get("/api/test", (req, res) => {
    res.json({
        message: "Swagatam backend is working!"
    });
});

// Test database connection
app.get("/api/check-route", (req, res) => {
    res.send("Database test route section is reachable!");
});

app.get("/api/db-test", (req, res) => {
    db.query("SELECT 1 AS result", (err, results) => {
        if (err) {
            return res.status(500).json({
                error: "Database query failed"
            });
        }

        res.json({
            message: "Swagatam database is connected!",
            result: results[0].result
        });
    });
});

// Fetch menu items from MySQL
app.get("/api/menu", (req, res) => {
    db.query("SELECT * FROM menu", (err, results) => {
        if (err) {
            console.error("Menu fetch error:", err.message);

            return res.status(500).json({
                error: "Unable to fetch menu items"
            });
        }

        res.json(results);
    });
});
// CREATE - Add a new menu item
app.post("/api/menu", (req, res) => {
    const {
        item_name,
        description,
        price,
        category,
        image_url
    } = req.body;

    if (
        typeof item_name !== "string" ||
        !item_name.trim() ||
        price === undefined ||
        price === null ||
        price === "" ||
        !Number.isFinite(Number(price)) ||
        Number(price) < 0
    ) {
        return res.status(400).json({
            message: "Valid item name and price are required."
        });
    }

    const sql = `
        INSERT INTO menu
        (item_name, description, price, category, image_url)
        VALUES (?, ?, ?, ?, ?)
    `;

    const values = [
        item_name.trim(),
        description || null,
        Number(price),
        category || null,
        image_url || null
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("Menu insert error:", err.message);

            return res.status(500).json({
                message: "Unable to add menu item."
            });
        }

        res.status(201).json({
            message: "Menu item added successfully!",
            id: result.insertId
        });
    });
});
// UPDATE - Edit an existing menu item
app.put("/api/menu/:id", (req, res) => {
    const id = Number(req.params.id);

    const {
        item_name,
        description,
        price,
        category,
        image_url
    } = req.body;

    if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        typeof item_name !== "string" ||
        !item_name.trim() ||
        price === undefined ||
        price === null ||
        price === "" ||
        !Number.isFinite(Number(price)) ||
        Number(price) < 0
    ) {
        return res.status(400).json({
            message: "Valid ID, item name and price are required."
        });
    }

    const sql = `
        UPDATE menu
        SET item_name = ?,
            description = ?,
            price = ?,
            category = ?,
            image_url = ?
        WHERE id = ?
    `;

    const values = [
        item_name.trim(),
        description || null,
        Number(price),
        category || null,
        image_url || null,
        id
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("Menu update error:", err.message);

            return res.status(500).json({
                message: "Unable to update menu item."
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Menu item not found."
            });
        }

        res.json({
            message: "Menu item updated successfully!"
        });
    });
});
// DELETE - Remove a menu item
app.delete("/api/menu/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Invalid menu item ID."
        });
    }

    const sql = "DELETE FROM menu WHERE id = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Menu delete error:", err.message);

            return res.status(500).json({
                message: "Unable to delete menu item."
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Menu item not found."
            });
        }

        res.json({
            message: "Menu item deleted successfully!"
        });
    });
});


// Contact form API with MySQL storage and email notification
app.post("/api/contact", (req, res) => {

    const { name, email, subject, message } = req.body || {};

    // Validate input fields
    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof subject !== "string" ||
        typeof message !== "string"
    ) {
        return res.status(400).json({
            message: "Please enter valid information in all fields."
        });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
        return res.status(400).json({
            message: "Please fill in all fields."
        });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(cleanEmail)) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    // Save contact details in MySQL
    const sql = `
        INSERT INTO contacts (name, email, subject, message)
        VALUES (?, ?, ?, ?)
    `;

    const values = [
        cleanName,
        cleanEmail,
        cleanSubject,
        cleanMessage
    ];

    db.query(sql, values, async (err, result) => {

        if (err) {
            console.error("Error saving contact:", err.message);

            return res.status(500).json({
                message: "Unable to save your message."
            });
        }

        console.log("Contact details saved in MySQL!");
        console.log("Inserted ID:", result.insertId);

        // Prepare email notification
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            replyTo: cleanEmail,
            subject: `New Contact Message: ${cleanSubject}`,
            text: `
New message received through Swagatam Restaurant website.

Name: ${cleanName}
Email: ${cleanEmail}
Subject: ${cleanSubject}

Message:
${cleanMessage}
            `
        };

        // Send email notification
        try {
            await transporter.sendMail(mailOptions);

            console.log("Email notification sent successfully!");

            return res.status(201).json({
                message: "Your message has been received successfully!"
            });

        } catch (emailError) {

            console.error("Email sending failed:", emailError.message);

            return res.status(201).json({
                message: "Your message was saved successfully, but email notification could not be sent."
            });
        }
    });
});


// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});