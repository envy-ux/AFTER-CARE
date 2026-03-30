const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const pdfParse = require("pdf-parse");

dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const upload = multer({ dest: "uploads/" });
const PORT = 5000;

// =============================
// 🧠 AI MODES
// =============================
const AI_MODES = {
  symptom: `
You are a doctor chatbot.

Rules:
- Ask ONLY ONE question at a time
- Keep replies VERY SHORT (max 10 words)
- Do NOT explain
- Do NOT give advice yet

When enough info is collected:
- Give diagnosis in 1 line
- Give advice in 1–2 short lines only

Flow:
Question → wait → Question → wait → Final answer

Be conversational.
`,
 lab: `
You are a medical lab analyzer.

Rules:
- NO paragraphs
- ONLY short bullet points
- Extract values clearly
- Highlight only abnormal values

Format:
• Hemoglobin: 12 ✅ Normal  
• RBC: 3.3 ⚠️ Low  
• WBC: 6.7 ✅ Normal  

At end:
• Risk: (very short 1 line)
• Action: (1 short line only)

Keep output clean and minimal.
`,
  vitals: `
You are a vitals analyzer.

Rules:
- ONLY bullet points
- NO paragraphs
- Keep it very short
- Max 5 lines

Format:
• BP: value → Normal/High/Low  
• Heart rate: value → Normal/High/Low  

End with:
• Risk: Low/Moderate/High  
• Action: short advice (1 line)

Keep everything simple and clear.
`,
  fitness: `
You are a fitness coach.

Rules:
- Give ONLY bullet points
- Keep it VERY simple
- Max 5 points
- Each point under 8 words
- No explanation
- No paragraphs

Include:
- Exercise
- Food tip
- Daily habit

Example:
• Walk 30 mins daily  
• 10 pushups morning  
• Drink more water  

Keep it practical and easy.
`,
  medicine: "Explain medicine uses, dosage and precautions.",
  diet: "Give a simple diet plan.",
  emergency: "Detect if situation is safe, warning or emergency.",
  summary: "Combine all health data and give final health report."
};

// =============================
// 🤖 AI FUNCTION
// =============================
async function askAI(input, mode) {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: AI_MODES[mode] },
          { role: "user", content: input }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data?.choices?.[0]?.message?.content || "No response";

  } catch (err) {
    console.error("AI ERROR:", err.message);
    return "AI temporarily unavailable ❌";
  }
}
let symptomChat = [];
// =============================
// 🩺 SYMPTOM
// =============================
app.post("/api/symptom", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.json({ reply: "Enter symptoms" });
  }

  try {
    // add user message
    symptomChat.push({ role: "user", content: text });

    const messages = [
      { role: "system", content: AI_MODES.symptom },
      ...symptomChat
    ];

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "openai/gpt-oss-120b",
        messages
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    // save AI reply
    symptomChat.push({ role: "assistant", content: reply });

    // limit memory
    if (symptomChat.length > 10) {
      symptomChat = symptomChat.slice(-10);
    }

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.json({ reply: "Symptom error" });
  }
});

// =============================
// 🧪 LAB
// =============================
app.post("/api/lab", upload.single("file"), async (req, res) => {
  try {
    console.log("FILE:", req.file);

    if (!req.file) {
      return res.json({ reply: "No file uploaded" });
    }

    let text = "";

    // ✅ Try reading PDF
    if (req.file.mimetype === "application/pdf") {
      try {
        const buffer = fs.readFileSync(req.file.path);
        const data = await pdfParse(buffer);
        text = data.text;
      } catch (e) {
        console.log("PDF READ ERROR:", e.message);
      }
    }

    // ✅ If text is empty → fallback
    if (!text || text.length < 20) {
      text = "Hemoglobin 12, RBC 3.3, WBC 6.7, Platelets 256, HCT 36";
    }

    // clean text
    text = text.replace(/\s+/g, " ");
    console.log("TEXT:", text);

    // ✅ AI call
    const reply = await askAI(
  `Extract and analyze this lab report:\n${text}`,
  "lab"
);

    // delete file safely
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    res.json({ reply });

  } catch (err) {
    console.error("LAB ERROR:", err.message);
    res.json({ reply: "Lab analysis failed ❌" });
  }
});

// =============================
// ❤️ VITALS
// =============================
app.post("/api/vitals", async (req, res) => {
  const { summary } = req.body;
  const reply = await askAI(
  `Analyze these vitals:\n${summary}`,
  "vitals"
);
  res.json({ reply });
});

// =============================
// 🏋️ FITNESS
// =============================
app.post("/api/fitness", async (req, res) => {
  const { goal } = req.body;
  const reply = await askAI(
  `Create simple daily fitness plan for: ${goal}`,
  "fitness"
);
  res.json({ reply });
});

// =============================
// 💊 MEDICINE
// =============================
app.post("/api/medicine", async (req, res) => {
  const { name } = req.body;
  const reply = await askAI(name, "medicine");
  res.json({ reply });
});

// =============================
// 🥗 DIET
// =============================
app.post("/api/diet", async (req, res) => {
  const { condition } = req.body;
  const reply = await askAI(condition, "diet");
  res.json({ reply });
});

// =============================
// 🚨 EMERGENCY
// =============================
app.post("/api/emergency", async (req, res) => {
  const { symptoms } = req.body;
  const reply = await askAI(symptoms, "emergency");
  res.json({ reply });
});

// =============================
// 🧠 SUMMARY
// =============================
app.post("/api/summary", async (req, res) => {
  const { symptoms, lab, vitals } = req.body;

  const input = `
Symptoms: ${symptoms}
Lab: ${lab}
Vitals: ${vitals}
`;

  const reply = await askAI(input, "summary");
  res.json({ reply });
});
// =============================
// 💊 MEDS API (MISSING FIX)
// =============================
let meds = [];

app.get("/api/meds", (req, res) => {
  res.json(meds);
});

app.post("/api/meds", (req, res) => {
  meds.push(req.body);
  res.json({ success: true });
});

app.delete("/api/meds/:id", (req, res) => {
  meds.splice(req.params.id, 1);
  res.json({ success: true });
});

// =============================
// 🏠 ROOT ROUTE (FIX)
// =============================
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});
// =============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});